# 10xClassify - Multimodal Tax Classification System

10xClassify is a powerful Next.js-based application that leverages Gemini 2.5 AI and Google Cloud Firestore to perform automated tax classification of products based on their names, descriptions, and visual content from images or PDF documents.

## Features

- **Multimodal AI Classification**: Uses Google Gemini to analyze product text and images.
- **Support for Multiple Countries**: Built-in support for US and India tax structures.
- **Bulk Document Processing**: Upload PDF invoices or product lists for automated line-item extraction and classification.
- **Admin Portal**: Review flags, update tax codes, and manage classifications.
- **History and Export**: Keep track of previous classifications and export results to Excel.
- **Cloud Database**: Powered by Google Cloud Firestore for secure and scalable data storage.
- **Secure Backend**: All sensitive logic and API keys are protected within Next.js API Route Handlers.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: Google Cloud Firestore
- **AI**: Google Gemini AI (Vertex AI)
- **Styling**: Tailwind CSS & Vanilla CSS
- **Icons**: Lucide React
- **File Handling**: XLSX, ExcelJS, jsPDF

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Google Cloud Project with Firestore and Vertex AI enabled
- Service Account Credentials (JSON)

### 2. Environment Variables
Create a `.env.local` file in the root directory and add the following:
```env
PROJECT_ID=your_gcp_project_id
GOOGLE_GENAI_USE_VERTEXAI=TRUE
GOOGLE_CLOUD_LOCATION=your_location (e.g., us-central1)
MODEL_NAME=gemini-2.5-flash
GOOGLE_APPLICATION_CREDENTIALS=./service_account_credentials.json
```

### 3. Database Setup
Ensure that your Firestore instance has the required collections:
- `10xclassify/users/records`
- `10xclassify/products/records`
- `10xclassify/hsn_codes_table/records`
- `10xclassify/knowledge_base/records`
- `10xclassify/chat_sessions/records`
- `10xclassify/chat_history/records`

### 4. Run Locally
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Deployment

Build the production bundle:
```bash
npm run build
npm start
```
