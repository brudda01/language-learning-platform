# Language Learning Platform Backend

A modern Node.js TypeScript Express backend for AI-powered vocabulary learning.

## 🚀 Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Create `.env` file:**
```
DATABASE_URL="postgresql://username:password@localhost:5432/language_learning_db"
GEMINI_API_KEY="your_gemini_api_key_here"
PORT=3001
NODE_ENV="development"
```

3. **Run development server:**
```bash
npm run dev
```

4. **Test health endpoint:**
```bash
curl http://localhost:3001/health
```

## 🛠️ Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL + Prisma ORM
- **AI**: Google Gemini
- **TTS**: gTTS (Google Text-to-Speech)
- **Validation**: Zod

## 📁 Project Structure

```
backend/
├── src/
│   ├── app.ts           # Express app entry point
│   ├── types/           # TypeScript interfaces
│   ├── config/          # Configuration
│   ├── middleware/      # Express middleware
│   ├── controllers/     # API route handlers
│   ├── services/        # Business logic
│   ├── routes/          # Express routes
│   └── utils/           # Helper functions
├── uploads/audio/       # TTS audio files
├── logs/               # Application logs
├── package.json
├── tsconfig.json
└── README.md
```