'use client';

import { useState } from 'react';
import FileUpload from '@/components/FileUpload';
import FileDownload from '@/components/FileDownload';
import InviteCode from '@/components/InviteCode';
import axios from 'axios';

export default function Home() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [port, setPort] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'download'>('upload');

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post("http://52.90.61.47:8080/upload", formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setPort(response.data.port);
      console.log(response.data.port);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleDownload = async (port: number) => {
  setIsDownloading(true);

  try {
    console.log(port)
    const response = await axios.get(`http://52.90.61.47:8080/download/${port}`, {
      responseType: "blob"
    });

    

    const disposition = response.headers["content-disposition"];
    let filename = "downloaded-file";

    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, "");
      }
    }

    const blob = new Blob([response.data], { type: response.headers["content-type"] });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error downloading file:", error);
    alert("Failed to download file. Please check the invite code and try again.");
  } finally {
    setIsDownloading(false);
  }
};

return (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 px-6 py-12">
    {/* Header */}
    <header className="text-center mb-16 animate-slide-up">
          <div className="relative">
            <h1 className="text-6xl md:text-7xl font-bold text-black mb-4 animate-float">PeerLink</h1>
            <div
              className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-accent/20 blur-2xl 
              opacity-30 animate-pulse-glow"
            />
          </div>
          <p className="text-xl md:text-2xl text-muted-foreground font-medium">
            Fast • Secure • Beautiful File Sharing
          </p>
          <div className="mt-6 flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-black rounded-full animate-pulse" />
              <span>End-to-end Encrypted</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-black rounded-full animate-pulse" style={{ animationDelay: "0.5s" }} />
              <span>No Registration Required</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-black rounded-full animate-pulse" style={{ animationDelay: "1s" }} />
              <span>Instant Transfer</span>
            </div>
          </div>
        </header>

    {/* Card */}
    <div className="w-full max-w-3xl bg-slate-50 border border-slate-300 shadow-lg rounded-2xl p-10">
      {/* Tabs */}
      <div className="flex justify-center gap-6 mb-8">
        <button
          className={`px-8 py-3 font-semibold text-lg rounded-xl transition-all duration-300 ${
            activeTab === 'upload'
              ? 'bg-emerald-200 text-emerald-900 shadow'
              : 'bg-slate-200 text-slate-700 hover:bg-emerald-100 hover:text-emerald-800'
          }`}
          onClick={() => setActiveTab('upload')}
        >
          Share a File
        </button>
        <button
          className={`px-8 py-3 font-semibold text-lg rounded-xl transition-all duration-300 ${
            activeTab === 'download'
              ? 'bg-sky-200 text-sky-900 shadow'
              : 'bg-slate-200 text-slate-700 hover:bg-sky-100 hover:text-sky-800'
          }`}
          onClick={() => setActiveTab('download')}
        >
          Receive a File
        </button>
      </div>

      {/* Upload Section */}
      {activeTab === 'upload' ? (
        <div className="space-y-6">
          <FileUpload onFileUpload={handleFileUpload} isUploading={isUploading} />

          {uploadedFile && !isUploading && (
            <div className="p-5 bg-emerald-100 rounded-xl border border-emerald-200">
              <p className="text-sm text-slate-800 font-light">
                Selected file:{" "}
                <span className="font-semibold text-emerald-900">{uploadedFile.name}</span>
                {" "}({Math.round(uploadedFile.size / 1024)} KB)
              </p>
            </div>
          )}

          {isUploading && (
            <div className="text-center space-y-3">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
              <p className="text-slate-700 font-medium">Uploading file...</p>
            </div>
          )}

          <InviteCode port={port} />
        </div>
      ) : (
        /* Download Section */
        <div className="space-y-6">
          <FileDownload onDownload={handleDownload} isDownloading={isDownloading} />

          {isDownloading && (
            <div className="text-center space-y-3">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-sky-500 border-t-transparent"></div>
              <p className="text-slate-700 font-medium">Downloading file...</p>
            </div>
          )}
        </div>
      )}
    </div>

    {/* Footer */}
    <footer className="mt-16 text-center text-slate-600 text-sm tracking-wide">
      <p>
        PeerLink &copy; {new Date().getFullYear()} — 
        <span className="text-emerald-800 font-semibold"> Secure P2P File Sharing</span>
      </p>
    </footer>
  </div>
);

}