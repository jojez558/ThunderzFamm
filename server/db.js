const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");
const BACKUP_DIR = path.join(__dirname, "..", "data", "backups");
const MONGO_URI = process.env.MONGODB_URI;
const MONGO_DB_NAME = process.env.MONGODB_DB_NAME || "thunderz_family";
let mongoClient = null;
let mongoCollection = null;
let mediaBucket = null;

function defaultData() {
  return {
    products: [
      {
        id: "vibe-crew",
        name: "Vibe Crew Tee",
        price: 3500,
        sizes: ["S", "M", "L", "XL"],
        description: "Heavyweight cotton, screen-printed crew logo.",
        stock: { S: 8, M: 12, L: 10, XL: 5 },
        color: "orange",
      },
      {
        id: "kix-squad",
        name: "Kix Squad Tee",
        price: 3500,
        sizes: ["S", "M", "L", "XL"],
        description: "Heavyweight cotton, front chest print.",
        stock: { S: 6, M: 10, L: 8, XL: 4 },
        color: "dark",
      },
      {
        id: "flex-force",
        name: "Flex Force Tee",
        price: 3500,
        sizes: ["S", "M", "L", "XL"],
        description: "Heavyweight cotton, back panel print.",
        stock: { S: 5, M: 9, L: 7, XL: 3 },
        color: "purple",
      },
    ],
    crew: [
      {
        id: "alex",
        name: "Vee",
        role: "CEO | Creative Director",
        color: "orange",
      },
      {
        id: "serah",
        name: 'Serah "Kix"',
        role: "Acromaster Specialist | Afro-Beat",
        color: "purple",
      },
      {
        id: "david",
        name: 'David "Flex"',
        role: "Technician & Freestyler | Fusion",
        color: "blue",
      },
    ],
    shows: [
      {
        id: "s1",
        date: "2026-10-12",
        name: "East Africa Dance Showcase",
        venue: "Main Stage",
        description: "Full crew set, three-genre program",
      },
      {
        id: "s2",
        date: "2026-10-25",
        name: "Masterclass: Afro-Fusion Intensive",
        venue: "Studio B",
        description: "Open workshop, all levels welcome",
      },
    ],
    videos: [],
    pageImages: {},
    bookings: [],
    orders: [],
    admin: {
      // default password: changeme123 — change it from the admin panel after first login
      passwordHash: bcrypt.hashSync("changeme123", 10),
    },
  };
}

function ensureFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData(), null, 2));
  }
}

function loadJson() {
  ensureFile();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.videos)) data.videos = [];
  if (!data.pageImages || typeof data.pageImages !== "object") data.pageImages = {};
  return data;
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function backup() {
  ensureFile();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `db-${stamp}.json`));
  const files = fs.readdirSync(BACKUP_DIR).sort().reverse();
  files.slice(7).forEach((file) => fs.unlinkSync(path.join(BACKUP_DIR, file)));
}

setInterval(
  () => {
    try {
      backup();
    } catch (err) {
      console.error("Database backup failed:", err.message);
    }
  },
  24 * 60 * 60 * 1000,
).unref();

// Serialize writes so two near-simultaneous requests can't clobber each
// other's changes (JSON.parse -> mutate -> JSON.stringify is not atomic).
let writeChain = Promise.resolve();
async function init() {
  if (!MONGO_URI) {
    console.log("Database: using local JSON file (set MONGODB_URI to use MongoDB).");
    return;
  }

  try {
    mongoClient = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClient.connect();
    const database = mongoClient.db(MONGO_DB_NAME);
    mongoCollection = database.collection("site_state");
    mediaBucket = new GridFSBucket(database, { bucketName: "site_images" });

    const existing = await mongoCollection.findOne({ _id: "content" });
    if (!existing) {
      await mongoCollection.insertOne({ _id: "content", ...loadJson() });
      console.log("Database: imported existing data/db.json into MongoDB.");
    } else if (!Array.isArray(existing.videos)) {
      await mongoCollection.updateOne(
        { _id: "content" },
        { $set: { videos: [], pageImages: {} } },
      );
    } else if (!existing.pageImages || typeof existing.pageImages !== "object") {
      await mongoCollection.updateOne(
        { _id: "content" },
        { $set: { pageImages: {} } },
      );
    }
    console.log(`Database: connected to MongoDB database "${MONGO_DB_NAME}".`);
  } catch (error) {
    console.warn(
      `Database: MongoDB unavailable (${error.message}). Falling back to local JSON file.`,
    );
    mongoClient = null;
    mongoCollection = null;
    mediaBucket = null;
  }
}

async function load() {
  if (!mongoCollection) return loadJson();
  const document = await mongoCollection.findOne({ _id: "content" });
  if (!document) throw new Error("MongoDB content document is missing.");
  const { _id, ...data } = document;
  if (!Array.isArray(data.videos)) data.videos = [];
  if (!data.pageImages || typeof data.pageImages !== "object") data.pageImages = {};
  return data;
}

function mutate(fn) {
  writeChain = writeChain.then(async () => {
    const data = await load();
    const result = await fn(data);
    if (mongoCollection) {
      await mongoCollection.replaceOne(
        { _id: "content" },
        { _id: "content", ...data },
        { upsert: true },
      );
    } else {
      save(data);
    }
    return result;
  });
  return writeChain;
}

function newId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function storeMedia(file) {
  if (!mediaBucket) {
    return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  }
  const upload = mediaBucket.openUploadStream(file.originalname, {
    contentType: file.mimetype,
  });
  await new Promise((resolve, reject) => {
    upload.once("finish", resolve);
    upload.once("error", reject);
    upload.end(file.buffer);
  });
  return `/api/media/${upload.id.toString()}`;
}

function mediaId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

async function openMedia(value) {
  if (!mediaBucket) return null;
  const id = mediaId(value);
  if (!id) return null;
  const files = await mediaBucket.find({ _id: id }).toArray();
  if (!files[0]) return null;
  return { file: files[0], stream: mediaBucket.openDownloadStream(id) };
}

async function deleteMedia(value) {
  if (!mediaBucket) return;
  const id = mediaId(value);
  if (id) await mediaBucket.delete(id).catch(() => {});
}

module.exports = { load, save, mutate, newId, backup, init, storeMedia, openMedia, deleteMedia };
