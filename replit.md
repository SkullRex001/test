# Medical Report Processing System

## Overview

This is a full-stack web application that processes medical reports using AI-powered text extraction and normalization. The system accepts both text input and medical images (like lab reports), extracts medical test data, normalizes the values against standard reference ranges, and provides structured output with patient summaries. It uses OpenAI's GPT-5 for OCR processing and medical data interpretation, with comprehensive guardrails to ensure accuracy and reliability.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Development**: tsx for development with hot reloading
- **Build**: esbuild for production bundling
- **File Uploads**: Multer middleware for handling image uploads (10MB limit, JPEG/PNG/PDF only)

### Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM
- **Cloud Provider**: Neon Database (serverless PostgreSQL)
- **Migrations**: Drizzle Kit for schema management
- **Fallback**: In-memory storage implementation for development/testing

### Database Schema
- **Users Table**: Basic user authentication with username/password
- **Medical Reports Table**: Comprehensive tracking of processing pipeline including:
  - Input type (text/image) and original content
  - OCR results with confidence scores
  - Normalized test data with reference ranges
  - Patient summaries and final output
  - Processing status and error handling
  - Performance metrics (processing time, confidence levels)

### AI Processing Pipeline
- **Text Preprocessing**: Corrects common OCR errors in medical terminology
- **Medical Test Normalization**: Maps various test name formats to standardized names with reference ranges
- **OpenAI Integration**: Uses GPT-5 for image OCR and patient summary generation
- **Guardrail System**: Validates confidence thresholds, test count limits, and data quality

### API Architecture
- **RESTful Design**: Standard HTTP methods with JSON responses
- **File Upload Endpoint**: Handles medical images with validation
- **Health Check**: System status monitoring
- **Statistics**: Processing metrics and success rates
- **Error Handling**: Comprehensive error middleware with structured responses

### Authentication and Authorization
- **Session Management**: PostgreSQL-based session storage using connect-pg-simple
- **User System**: Basic username/password authentication
- **Request Logging**: Detailed API request/response logging for monitoring

## External Dependencies

### Third-Party Services
- **OpenAI API**: GPT-5 model for OCR processing and medical data interpretation
- **Neon Database**: Serverless PostgreSQL hosting for production data storage

### Key Libraries
- **Database**: Drizzle ORM with PostgreSQL driver, Zod for schema validation
- **AI/ML**: OpenAI SDK for language model integration
- **File Processing**: Multer for multipart form data and file uploads
- **UI Framework**: Radix UI primitives with shadcn/ui component system
- **Development Tools**: Vite with React plugin, TypeScript compiler, Tailwind CSS
- **State Management**: TanStack Query for server state, React Hook Form for forms
- **Utilities**: date-fns for date handling, clsx for conditional classes

### Development Integration
- **Replit**: Integrated development environment with specialized plugins
- **Hot Reloading**: Vite development server with runtime error overlays
- **TypeScript**: Full type safety across frontend, backend, and shared schemas