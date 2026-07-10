"""Tests for authentication endpoints: register, login, refresh."""
import pytest


class TestRegister:
    def test_register_success(self, client):
        resp = client.post("/v1/register", json={
            "username": "newuser",
            "password": "SecurePass1!",
            "email": "new@example.com",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body
        assert body["token_type"] == "bearer"
        assert body["username"] == "newuser"

    def test_register_duplicate_username(self, client, registered_user):
        username, password, _ = registered_user
        resp = client.post("/v1/register", json={
            "username": username,
            "password": "AnotherPass1!",
        })
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"].lower()

    def test_register_duplicate_email(self, client, registered_user):
        resp = client.post("/v1/register", json={
            "username": "uniqueuser99",
            "password": "SecurePass1!",
            "email": "test@example.com",  # same email as registered_user
        })
        assert resp.status_code == 400

    def test_register_missing_username(self, client):
        resp = client.post("/v1/register", json={"password": "SecurePass1!"})
        assert resp.status_code == 422


class TestLogin:
    def test_login_success(self, client, registered_user):
        username, password, _ = registered_user
        resp = client.post("/v1/login", json={"username": username, "password": password})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, client, registered_user):
        username, _, _ = registered_user
        resp = client.post("/v1/login", json={"username": username, "password": "wrong!"})
        assert resp.status_code == 400

    def test_login_unknown_user(self, client):
        resp = client.post("/v1/login", json={"username": "ghost", "password": "pass"})
        assert resp.status_code == 400

    def test_login_returns_expires_in(self, client, registered_user):
        username, password, _ = registered_user
        resp = client.post("/v1/login", json={"username": username, "password": password})
        body = resp.json()
        assert body["access_token_expires_in"] > 0
        assert body["refresh_token_expires_in"] > 0


class TestRefresh:
    def test_refresh_success(self, client, registered_user):
        _, _, tokens = registered_user
        resp = client.post("/v1/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body

    def test_refresh_invalid_token(self, client):
        resp = client.post("/v1/refresh", json={"refresh_token": "not.a.valid.token"})
        assert resp.status_code == 401

    def test_refresh_with_access_token_rejected(self, client, registered_user):
        _, _, tokens = registered_user
        # Using the access token where a refresh token is expected must be rejected
        resp = client.post("/v1/refresh", json={"refresh_token": tokens["access_token"]})
        assert resp.status_code == 401


class TestProtectedEndpoint:
    def test_no_token_returns_401(self, client):
        resp = client.get("/v1/users/me")
        assert resp.status_code == 401

    def test_valid_token_accepted(self, client, auth_headers):
        resp = client.get("/v1/users/me", headers=auth_headers)
        # Either 200 or 404 depending on profile existence — but NOT 401
        assert resp.status_code != 401
