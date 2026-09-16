"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";

export default function Settings() {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");

  const { data: credentials, isLoading } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => api.getCredentials(),
  });

  const addMutation = useMutation({
    mutationFn: () => api.addCredential(provider, apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      setApiKey("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCredential(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.testCredential(id),
  });

  const creds = credentials?.data || [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      
      <div className="max-w-2xl">
        {/* AI Providers */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">AI Providers</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Add Provider Key</label>
            <div className="flex gap-2">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="border rounded-lg px-3 py-2"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
                <option value="openrouter">OpenRouter</option>
              </select>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API Key"
                className="flex-1 border rounded-lg px-3 py-2"
              />
              <button
                onClick={() => addMutation.mutate()}
                disabled={!apiKey || addMutation.isPending}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {addMutation.isPending ? "Adding..." : "Add"}
              </button>
            </div>
            {addMutation.isError && (
              <p className="text-red-500 text-sm mt-1">{addMutation.error.message}</p>
            )}
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <p className="text-gray-500">Loading...</p>
            ) : creds.length === 0 ? (
              <p className="text-gray-500">No API keys configured</p>
            ) : (
              creds.map((cred: any) => (
                <div key={cred.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium">{cred.provider}</div>
                    <div className="text-sm text-gray-500">
                      ••••••••••{cred.keyFingerprint}
                    </div>
                    <div className="text-xs text-gray-400">
                      Status: {cred.status}
                      {cred.lastUsedAt && ` • Last used: ${new Date(cred.lastUsedAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => testMutation.mutate(cred.id)}
                      disabled={testMutation.isPending}
                      className="text-sm text-blue-500 hover:text-blue-700"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(cred.id)}
                      disabled={deleteMutation.isPending}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Model Settings */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">Model Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Default Provider</label>
              <select className="mt-1 block w-full border rounded-lg px-3 py-2">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Default Model</label>
              <select className="mt-1 block w-full border rounded-lg px-3 py-2">
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Data Management</h2>
          <div className="space-y-4">
            <button className="bg-gray-500 text-white px-4 py-2 rounded-lg">
              Export Data
            </button>
            <button className="bg-red-500 text-white px-4 py-2 rounded-lg">
              Delete All Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
