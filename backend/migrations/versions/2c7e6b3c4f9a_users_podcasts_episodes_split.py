"""add users and podcasts, update episodes uniqueness

Revision ID: 2c7e6b3c4f9a
Revises: 1f5f3b6a9d12
Create Date: 2026-02-02
"""

from alembic import op
import sqlalchemy as sa
from urllib.parse import urlsplit, urlunsplit
import hashlib


# revision identifiers, used by Alembic.
revision = "2c7e6b3c4f9a"
down_revision = "1f5f3b6a9d12"
branch_labels = None
depends_on = None


def _normalize_url(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, "", ""))


def upgrade():
    # Create users table
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_id", "users", ["id"])

    # Create podcasts table
    op.create_table(
        "podcasts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("rss_url", sa.String(), nullable=True),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_podcasts_title", "podcasts", ["title"])

    # Add columns to episodes
    op.add_column("episodes", sa.Column("user_id", sa.String(), nullable=True))
    op.add_column("episodes", sa.Column("podcast_id", sa.Integer(), nullable=True))
    op.add_column("episodes", sa.Column("source_guid", sa.String(), nullable=True))
    op.add_column("episodes", sa.Column("source_key", sa.String(), nullable=True))

    # Drop old unique index on source_url
    op.drop_index("ix_episodes_source_url", table_name="episodes")

    # Create new indexes
    op.create_index("ix_episodes_user_id", "episodes", ["user_id"])
    op.create_index("ix_episodes_podcast_id", "episodes", ["podcast_id"])
    op.create_index("ix_episodes_source_key", "episodes", ["source_key"])

    # Backfill default user
    bind = op.get_bind()
    bind.execute(sa.text("INSERT INTO users (id) VALUES (:id) ON CONFLICT DO NOTHING"), {"id": "local-user"})

    # Backfill podcasts from existing episodes
    rows = bind.execute(sa.text("SELECT DISTINCT show_name, image_url FROM episodes")).fetchall()
    podcast_map = {}
    for show_name, image_url in rows:
        if not show_name:
            show_name = "Unknown Show"
        # insert podcast
        res = bind.execute(
            sa.text(
                "INSERT INTO podcasts (title, image_url) VALUES (:title, :image_url) RETURNING id"
            ),
            {"title": show_name, "image_url": image_url},
        )
        podcast_id = res.scalar()
        podcast_map[(show_name, image_url)] = podcast_id

    # Update episodes with user_id, podcast_id, source_key
    episodes = bind.execute(sa.text("SELECT id, source_url, show_name, image_url FROM episodes")).fetchall()
    for ep_id, source_url, show_name, image_url in episodes:
        if not show_name:
            show_name = "Unknown Show"
        podcast_id = podcast_map.get((show_name, image_url))
        source_key = None
        if source_url:
            source_key = hashlib.sha256(_normalize_url(source_url).encode("utf-8")).hexdigest()
        bind.execute(
            sa.text(
                "UPDATE episodes SET user_id = :user_id, podcast_id = :podcast_id, source_key = :source_key WHERE id = :id"
            ),
            {"user_id": "local-user", "podcast_id": podcast_id, "source_key": source_key, "id": ep_id},
        )

    # Unique constraint: user_id + source_key
    op.create_unique_constraint("uq_episodes_user_source_key", "episodes", ["user_id", "source_key"])


def downgrade():
    op.drop_constraint("uq_episodes_user_source_key", "episodes", type_="unique")
    op.drop_index("ix_episodes_source_key", table_name="episodes")
    op.drop_index("ix_episodes_podcast_id", table_name="episodes")
    op.drop_index("ix_episodes_user_id", table_name="episodes")
    op.drop_column("episodes", "source_key")
    op.drop_column("episodes", "source_guid")
    op.drop_column("episodes", "podcast_id")
    op.drop_column("episodes", "user_id")
    op.create_index("ix_episodes_source_url", "episodes", ["source_url"], unique=True)
    op.drop_table("podcasts")
    op.drop_table("users")
