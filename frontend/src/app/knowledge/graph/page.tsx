"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import { Loader2, ZoomIn, ZoomOut, Search } from "lucide-react";

interface GraphNode {
  id: number;
  label: string;
  type: "person" | "org" | "product" | "concept";
  mentions: number;
}

interface GraphLink {
  source: number;
  target: number;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  stats?: {
    total_nodes: number;
    total_links: number;
  };
}

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredNodes, setFilteredNodes] = useState<GraphNode[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["graph-full"],
    queryFn: () => api.get("/v1/graph/full").then((r) => r.data as GraphData),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    if (!data?.nodes) return;

    const filtered = data.nodes.filter((node) =>
      node.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredNodes(filtered);
  }, [data?.nodes, searchTerm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Building your knowledge graph...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">
            Failed to load graph
          </h1>
          <p className="text-gray-600 mb-4">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const typeColors = {
    person: "#60a5fa",
    org: "#34d399",
    product: "#f59e0b",
    concept: "#a78bfa",
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">
          Knowledge Graph Explorer
        </h1>

        <div className="flex gap-4 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search entities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="text-sm text-gray-600">
            <span className="font-semibold">{data.stats?.total_nodes || 0}</span> entities •{" "}
            <span className="font-semibold">{data.stats?.total_links || 0}</span> connections
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-6 mt-4 text-sm">
          {Object.entries(typeColors).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-gray-600 capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas placeholder - actual graph rendering would use react-force-graph-2d */}
      <div className="flex-1 relative bg-white overflow-auto">
        {/* Graph visualization would render here */}
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Entity-relationship graph visualization
            </p>
            <p className="text-sm text-gray-500">
              {filteredNodes.length} entities matched
            </p>

            {/* Entity List */}
            <div className="mt-6 max-w-2xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-800 mb-3 text-left">
                Entities {searchTerm && `matching "${searchTerm}"`}
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredNodes.slice(0, 20).map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200 hover:border-blue-400 cursor-pointer transition"
                    onClick={() =>
                      router.push(`/search?q=${encodeURIComponent(node.label)}`)
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: typeColors[node.type] }}
                      />
                      <div className="text-left">
                        <p className="font-medium text-gray-800">
                          {node.label}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">
                          {node.type}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-gray-600">
                      {node.mentions} mentions
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-t border-gray-200 p-4 flex gap-2">
        <button
          className="p-2 hover:bg-gray-100 rounded transition"
          title="Zoom in"
        >
          <ZoomIn className="w-5 h-5 text-gray-600" />
        </button>
        <button
          className="p-2 hover:bg-gray-100 rounded transition"
          title="Zoom out"
        >
          <ZoomOut className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    </div>
  );
}
