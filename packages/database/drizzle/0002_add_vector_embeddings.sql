-- Create vector_embeddings table for semantic search
CREATE TABLE IF NOT EXISTS vector_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  embedding TEXT NOT NULL, -- JSON array of floats
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS vector_embeddings_workspace_idx ON vector_embeddings(workspace_id);
CREATE INDEX IF NOT EXISTS vector_embeddings_entity_idx ON vector_embeddings(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS vector_embeddings_model_idx ON vector_embeddings(model);

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column for cosine similarity search
ALTER TABLE vector_embeddings ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS vector_embeddings_vector_idx ON vector_embeddings 
  USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);

-- RLS policies for vector_embeddings
ALTER TABLE vector_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their workspace embeddings" ON vector_embeddings
  FOR SELECT USING (
    workspace_id = current_setting('app.current_workspace_id')::uuid
  );

CREATE POLICY "Users can insert their workspace embeddings" ON vector_embeddings
  FOR INSERT WITH CHECK (
    workspace_id = current_setting('app.current_workspace_id')::uuid
  );

CREATE POLICY "Users can update their workspace embeddings" ON vector_embeddings
  FOR UPDATE USING (
    workspace_id = current_setting('app.current_workspace_id')::uuid
  );

CREATE POLICY "Users can delete their workspace embeddings" ON vector_embeddings
  FOR DELETE USING (
    workspace_id = current_setting('app.current_workspace_id')::uuid
  );
