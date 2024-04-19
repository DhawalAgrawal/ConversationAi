import { DocumentInterface } from "@langchain/core/documents";
import { RecursiveUrlLoader } from "langchain/document_loaders/web/recursive_url";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama"; //local
import { Embeddings } from "@langchain/core/embeddings";
import { Chroma } from "@langchain/community/vectorstores/chroma"; //local
import { PostgresRecordManager } from "@langchain/community/indexes/postgres";
import { SitemapLoader } from "langchain/document_loaders/web/sitemap";
import { index } from "./_index.js";

async function loadURLDocs(): Promise<Array<DocumentInterface>> {
  if (!process.env.INGESTED_URL) {
    throw new Error("INGESTED_URL must be set in the environment");
  }
  const loader = new RecursiveUrlLoader(process.env.INGESTED_URL, {
    maxDepth: 20,
    timeout: 600,
  });
  return loader.load();
}

async function loadURLSitemapsDocs(): Promise<Array<DocumentInterface>> {
  if (!process.env.INGESTED_URL) {
    throw new Error("INGESTED_URL must be set in the environment");
  }
  const loader = new SitemapLoader(process.env.INGESTED_URL);
  return loader.load();
}

function getEmbeddingsModel(): Embeddings {
  return new OllamaEmbeddings({
    model: "nomic-embed-text",
  });
}

async function ingestDocs() {
  if (
    !process.env.DATABASE_HOST ||
    !process.env.DATABASE_PORT ||
    !process.env.DATABASE_USERNAME ||
    !process.env.DATABASE_PASSWORD ||
    !process.env.DATABASE_NAME
  ) {
    throw new Error(
      "DATABASE_HOST, DATABASE_PORT, DATABASE_USERNAME, DATABASE_PASSWORD, and DATABASE_NAME must be set in the environment"
    );
  }

  const urlDocs = await loadURLDocs();
  console.debug(
    `Loaded ${urlDocs.length} docs from ${process.env.INGESTED_URL}`
  );
  const urlSitemapsDocs = await loadURLSitemapsDocs();
  console.debug(`Loaded ${urlSitemapsDocs.length} docs from sitemaps`);

  if (!urlDocs.length || !urlSitemapsDocs.length) {
    process.exit(1);
  }

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkOverlap: 200,
    chunkSize: 4000,
  });
  const docsTransformed = await textSplitter.splitDocuments([
    ...urlDocs,
    ...urlSitemapsDocs,
  ]);

  for (const doc of docsTransformed) {
    if (!doc.metadata.source) {
      doc.metadata.source = "";
    }
    if (!doc.metadata.title) {
      doc.metadata.title = "";
    }
  }

  const embeddings = getEmbeddingsModel();

  const vectorStore = new Chroma(embeddings, {
    collectionName: process.env.COLLECTION_NAME,
  });

  const connectionOptions = process.env.RECORD_MANAGER_DB_URL
    ? {
        connectionString: process.env.RECORD_MANAGER_DB_URL,
      }
    : {
        host: process.env.DATABASE_HOST,
        port: Number(process.env.DATABASE_PORT),
        user: process.env.DATABASE_USERNAME,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
      };

  const recordManager = new PostgresRecordManager(
    `local/${process.env.COLLECTION_NAME}`,
    {
      postgresConnectionOptions: connectionOptions,
    }
  );

  await recordManager.createSchema();

  const indexingStats = await index({
    docsSource: docsTransformed,
    recordManager,
    vectorStore,
    cleanup: "full",
    sourceIdKey: "source",
    forceUpdate: process.env.FORCE_UPDATE === "true",
  });

  console.log(
    {
      indexingStats,
    },
    "Indexing stats"
  );
}

ingestDocs().catch((e) => {
  console.error("Failed to ingest docs");
  console.error(e);
  process.exit(1);
});
