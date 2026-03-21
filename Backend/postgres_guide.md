# Working with PostgreSQL and Prisma

Since you've migrated from MongoDB (a NoSQL database) to PostgreSQL (a Relational database), the way data is structured and queried has changed. However, by using **Prisma ORM**, the transition is much smoother because Prisma provides a very intuitive, JavaScript-friendly way to interact with your Postgres database.

This guide will help you understand how to manage and interact with your new database locally and in production.

---

## 1. What is Prisma?

Prisma is an Object-Relational Mapper (ORM). Just like Mongoose was your bridge to MongoDB, Prisma is your bridge to PostgreSQL.
- **Schema First**: Instead of defining models in JS files (like Mongoose), you define them in a single [prisma/schema.prisma](file:///c:/Users/prana/Desktop/lolol/lolololololol/prisma/schema.prisma) file.
- **Type Safety**: Prisma generates a custom client (`@prisma/client`) based on your schema, which gives you excellent auto-completion in your code editor.

---

## 2. Managing the Database

This backend is configured to use a hosted PostgreSQL database such as Supabase.

### Recommended: Supabase
1. Create a project on [Supabase](https://supabase.com/).
2. Open the database settings and copy the Postgres connection string.
3. Paste that connection string into your `.env` as `DATABASE_URL`.

### Formatting your `DATABASE_URL`
Once Postgres is running locally, you need to provide Prisma with the connection string in your [.env](file:///c:/Users/prana/Desktop/lolol/lolololololol/.env) file:
```env
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE_NAME?sslmode=require
DATABASE_URL="postgresql://postgres.your-project-ref:your-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
```

---

## 3. Syncing Your Prisma Schema with Postgres

When you change [prisma/schema.prisma](file:///c:/Users/prana/Desktop/lolol/lolololololol/prisma/schema.prisma) (e.g., adding a new field or model), you must sync those changes to the actual database.

- **For Prototyping/Local Dev:**
  Run `npx prisma db push`. This forcefully syncs your Prisma schema with the database. It will create tables if they don't exist.
  
- **For Production/Version Control:**
  Run `npx prisma migrate dev --name init`. This creates SQL migration files in a `prisma/migrations` folder, keeping a history of all schema changes over time.

- **To update the `@prisma/client` in your `node_modules`:**
  Run `npx prisma generate` (or `bun run prisma generate`). You must do this whenever you change the schema so your code knows about the new fields.

---

## 4. Production Hosting Options

When you deploy your backend to the internet, you shouldn't use a local database. You'll need a managed PostgreSQL hosting service. Here are the best free/cheap options:

1. **[Supabase](https://supabase.com/)** (Recommended)
   - Gives you a full Postgres database with a beautiful dashboard (the "Firebase of Postgres").
2. **[Neon Tech](https://neon.tech/)**
   - Built for modern serverless apps.
   - Generates a connection string instantly.
   - Extremely fast and has a generous free tier.
3. **[Render](https://render.com/)** natively supports deploying Postgres databases alongside Node.js backends.

**Deployment Steps:**
1. Create an account on Supabase and create a new project.
2. Copy the provided `DATABASE_URL` (Connection String).
3. Paste that `DATABASE_URL` into your production server's Environment Variables.
4. Run `npx prisma migrate deploy` in your deployment script to build the tables on the production DB.

---

## 5. Mongoose vs. Prisma: Quick Translation Cheat Sheet

Here's how common database operations translate from Mongoose to Prisma.

### Finding a single record
**Mongoose:**
```javascript
const user = await User.findById(id);
const user = await User.findOne({ email: "test@test.com" });
```
**Prisma:**
```javascript
const user = await prisma.user.findUnique({ where: { id: id } });
const user = await prisma.user.findUnique({ where: { email: "test@test.com" } });
```

### Finding many records
**Mongoose:**
```javascript
const videos = await Video.find({ isPublished: true }).sort({ createdAt: -1 }).limit(10);
```
**Prisma:**
```javascript
const videos = await prisma.video.findMany({
  where: { isPublished: true },
  orderBy: { createdAt: 'desc' },
  take: 10
});
```

### Creating
**Mongoose:**
```javascript
const post = await Post.create({ content: "hello", ownerId: userId });
```
**Prisma:**
```javascript
const post = await prisma.post.create({
  data: { content: "hello", ownerId: userId }
});
```

### Updating
**Mongoose:**
```javascript
await User.findByIdAndUpdate(id, { fullname: "New Name" });
```
**Prisma:**
```javascript
await prisma.user.update({
  where: { id: id },
  data: { fullname: "New Name" }
});
```

### Joining Collections (Populate / $lookup)
**Mongoose:**
```javascript
await Video.findById(id).populate("owner", "username avatar");
```
**Prisma:** Use `include` or nested `select`. It handles the joins cleanly using SQL under the hood.
```javascript
await prisma.video.findUnique({
  where: { id: id },
  include: {
    owner: { select: { username: true, avatar: true } }
  }
});
```

### Graphing complex queries (Aggregations)
**Mongoose:** Complex array pipelines with `$match`, `$group`, etc.
**Prisma:** Uses `aggregate` or `groupBy` functions, or straight counting.
```javascript
// Counting all likes for a video
const likes = await prisma.like.count({ where: { videoId: id } });
```

---

## 6. Accessing Prisma Studio

If you want a visual interface to see all your tables and edit data directly (like MongoDB Compass but in your browser), just run:

```bash
npx prisma studio
```
This will open a local web server (usually at `localhost:5555`) where you can easily view and edit all your PostgreSQL data.
