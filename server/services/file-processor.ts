import { openaiService } from './openai';
import { textPreprocessor } from './text-preprocessor';
import sharp from 'sharp';

export interface FileProcessingResult {
  text: string;
  confidence: number;
  fileType: 'image' | 'pdf' | 'dicom';
  metadata?: any;
}

export class FileProcessor {
  async processFile(buffer: Buffer, filename: string, mimetype: string): Promise<FileProcessingResult> {
    // Determine file type and process accordingly
    if (mimetype === 'application/pdf') {
      return await this.processPDF(buffer, filename);
    } else if (mimetype === 'application/dicom') {
      return await this.processDicom(buffer, filename);
    } else if (mimetype === 'application/octet-stream') {
      // For octet-stream, validate it's actually a DICOM file
      if (this.isDicomFile(buffer, filename)) {
        return await this.processDicom(buffer, filename);
      } else {
        throw new Error('application/octet-stream files must have valid DICOM signature (DICM at offset 128)');
      }
    } else if (mimetype.startsWith('image/')) {
      return await this.processImage(buffer, filename);
    } else {
      throw new Error(`Unsupported file type: ${mimetype}`);
    }
  }

  private async processPDF(buffer: Buffer, filename: string): Promise<FileProcessingResult> {
    try {
      console.log(`Processing PDF file: ${filename}`);
      
      // Dynamically import pdf-parse to avoid module loading issues
      const pdfParse = (await import('pdf-parse')).default;
      
      // Extract text directly from PDF
      const data = await pdfParse(buffer);
      const extractedText = data.text.trim();
      
      if (extractedText.length > 50) {
        // Good text extraction
        return {
          text: extractedText,
          confidence: 0.9, // High confidence for direct text extraction
          fileType: 'pdf',
          metadata: {
            pages: data.numpages,
            info: data.info,
            textLength: extractedText.length
          }
        };
      } else {
        // Poor text extraction, might be image-based PDF
        console.log('PDF has minimal text, might be image-based. Using OCR...');
        return await this.processPdfWithOcr(buffer, filename);
      }
    } catch (error) {
      console.error('PDF processing failed:', error);
      throw new Error(`PDF processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processPdfWithOcr(buffer: Buffer, filename: string): Promise<FileProcessingResult> {
    try {
      console.log('Using OCR for image-based PDF - converting pages to images');
      
      // Dynamically import pdf2pic to convert PDF pages to images
      const pdf2pic = (await import('pdf2pic')).default;
      
      // Convert first 3 pages max to control costs
      const convert = pdf2pic.fromBuffer(buffer, {
        density: 200,           // DPI for good OCR quality
        saveFilename: "page",
        savePath: "/tmp",
        format: "jpeg",
        width: 2000,
        height: 2000
      });
      
      let combinedText = '';
      let totalConfidence = 0;
      let processedPages = 0;
      const maxPages = 3; // Limit to control costs
      
      // Process pages until we get enough text or hit limits
      for (let page = 1; page <= maxPages; page++) {
        try {
          const result = await convert(page);
          const imagePath = result.path;
          
          // Read the image and convert to base64
          const imageBuffer = await require('fs').promises.readFile(imagePath);
          const base64Data = imageBuffer.toString('base64');
          
          // Extract text using OCR
          const ocrResult = await openaiService.extractTextFromImage(base64Data);
          
          if (ocrResult.text && ocrResult.text.length > 10) {
            combinedText += `\n--- Page ${page} ---\n${ocrResult.text}`;
            totalConfidence += ocrResult.confidence;
            processedPages++;
          }
          
          // Clean up temp file
          try {
            await require('fs').promises.unlink(imagePath);
          } catch (cleanupError) {
            console.warn('Could not cleanup temp image:', cleanupError);
          }
          
          // Stop if we have sufficient content
          if (combinedText.length > 200) {
            break;
          }
        } catch (pageError) {
          console.warn(`Failed to process page ${page}:`, pageError);
          // Continue with next page
        }
      }
      
      if (processedPages === 0) {
        throw new Error('No pages could be processed from PDF');
      }
      
      const avgConfidence = totalConfidence / processedPages;
      
      return {
        text: combinedText.trim(),
        confidence: avgConfidence * 0.8, // Slightly lower confidence for PDF OCR
        fileType: 'pdf',
        metadata: {
          processingMethod: 'ocr',
          pagesProcessed: processedPages,
          originalSize: buffer.length
        }
      };
    } catch (error) {
      console.error('PDF OCR processing failed:', error);
      throw new Error(`PDF OCR failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processImage(buffer: Buffer, filename: string): Promise<FileProcessingResult> {
    try {
      console.log(`Processing image file: ${filename}`);
      
      // Optimize image for OCR using sharp
      const processedBuffer = await sharp(buffer)
        .resize(2000, 2000, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality: 95 })
        .toBuffer();

      const base64Data = processedBuffer.toString('base64');
      const ocrResult = await openaiService.extractTextFromImage(base64Data);
      
      // Get image metadata
      const metadata = await sharp(buffer).metadata();
      
      return {
        text: ocrResult.text,
        confidence: ocrResult.confidence,
        fileType: 'image',
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          originalSize: buffer.length,
          processedSize: processedBuffer.length
        }
      };
    } catch (error) {
      console.error('Image processing failed:', error);
      throw new Error(`Image processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processDicom(buffer: Buffer, filename: string): Promise<FileProcessingResult> {
    try {
      console.log(`Processing DICOM file: ${filename}`);
      
      // Import dicom-parser for proper DICOM tag extraction
      const dicomParser = (await import('dicom-parser')).default;
      
      // Parse DICOM file to extract metadata
      const dataSet = dicomParser.parseDicom(buffer);
      
      // Extract standard DICOM tags
      const dicomData = this.extractDicomTags(dataSet);
      
      // Build medical text content from DICOM metadata
      let extractedText = this.buildMedicalTextFromDicom(dicomData);
      
      // Calculate confidence based on extracted data quality
      const confidence = this.calculateDicomConfidence(dicomData);
      
      return {
        text: extractedText,
        confidence: confidence,
        fileType: 'dicom',
        metadata: {
          ...dicomData,
          originalSize: buffer.length,
          processingMethod: 'dicom_tag_extraction'
        }
      };
    } catch (error) {
      console.error('DICOM processing failed:', error);
      throw new Error(`DICOM processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private isDicomFile(buffer: Buffer, filename: string): boolean {
    // Check for DICOM magic bytes at offset 128
    if (buffer.length > 132) {
      const magic = buffer.toString('ascii', 128, 132);
      return magic === 'DICM';
    }
    
    // Check file extension as fallback
    return filename.toLowerCase().endsWith('.dcm') || 
           filename.toLowerCase().endsWith('.dicom');
  }

  private extractDicomTags(dataSet: any): any {
    const dicomData: any = {
      patientName: null,
      patientID: null,
      studyDate: null,
      modality: null,
      studyDescription: null,
      seriesDescription: null,
      institutionName: null,
      manufacturerModel: null,
      studyInstanceUID: null,
      accessionNumber: null
    };
    
    try {
      // Standard DICOM tags - using hexadecimal format
      dicomData.patientName = this.getDicomString(dataSet, 'x00100010'); // Patient's Name
      dicomData.patientID = this.getDicomString(dataSet, 'x00100020'); // Patient ID
      dicomData.studyDate = this.getDicomString(dataSet, 'x00080020'); // Study Date
      dicomData.modality = this.getDicomString(dataSet, 'x00080060'); // Modality
      dicomData.studyDescription = this.getDicomString(dataSet, 'x00081030'); // Study Description
      dicomData.seriesDescription = this.getDicomString(dataSet, 'x0008103e'); // Series Description
      dicomData.institutionName = this.getDicomString(dataSet, 'x00080080'); // Institution Name
      dicomData.manufacturerModel = this.getDicomString(dataSet, 'x00081090'); // Manufacturer's Model Name
      dicomData.studyInstanceUID = this.getDicomString(dataSet, 'x0020000d'); // Study Instance UID
      dicomData.accessionNumber = this.getDicomString(dataSet, 'x00080050'); // Accession Number
      
    } catch (error) {
      console.warn('Error extracting DICOM tags:', error);
    }
    
    return dicomData;
  }
  
  private getDicomString(dataSet: any, tag: string): string | null {
    try {
      const element = dataSet.elements[tag];
      if (element) {
        return dataSet.string(tag) || null;
      }
    } catch (error) {
      // Tag not present or error reading
    }
    return null;
  }
  
  private buildMedicalTextFromDicom(dicomData: any): string {
    let content = 'DICOM Medical Imaging Study\n\n';
    
    if (dicomData.patientName) {
      content += `Patient: ${dicomData.patientName}\n`;
    }
    if (dicomData.patientID) {
      content += `Patient ID: ${dicomData.patientID}\n`;
    }
    if (dicomData.studyDate) {
      // Format date for readability (YYYYMMDD -> YYYY-MM-DD)
      const dateStr = dicomData.studyDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      content += `Study Date: ${dateStr}\n`;
    }
    if (dicomData.modality) {
      content += `Imaging Modality: ${dicomData.modality}\n`;
    }
    if (dicomData.studyDescription) {
      content += `Study: ${dicomData.studyDescription}\n`;
    }
    if (dicomData.seriesDescription) {
      content += `Series: ${dicomData.seriesDescription}\n`;
    }
    if (dicomData.institutionName) {
      content += `Institution: ${dicomData.institutionName}\n`;
    }
    if (dicomData.accessionNumber) {
      content += `Accession Number: ${dicomData.accessionNumber}\n`;
    }
    
    content += '\n[DICOM file contains medical imaging data - image analysis requires specialized medical imaging software]';
    
    return content;
  }
  
  private calculateDicomConfidence(dicomData: any): number {
    let confidence = 0.3; // Base confidence for DICOM detection
    
    // Increase confidence based on extracted data quality
    if (dicomData.patientName) confidence += 0.15;
    if (dicomData.patientID) confidence += 0.15;
    if (dicomData.studyDate) confidence += 0.1;
    if (dicomData.modality) confidence += 0.15;
    if (dicomData.studyDescription) confidence += 0.1;
    if (dicomData.institutionName) confidence += 0.05;
    
    return Math.min(confidence, 0.8); // Cap at 0.8 since it's metadata extraction, not OCR
  }
}

export const fileProcessor = new FileProcessor();