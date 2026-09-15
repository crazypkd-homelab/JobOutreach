import { RESUMES_DIR } from "../../config.js";

export interface ParseResult {
  text: string;
  mime: string;
}

/**
 * Extracts plain text from a resume file buffer.
 * Supports PDF and DOCX; other types fall back to UTF-8 text.
 */
export async function parseResume(buffer: Buffer, mime: string, fileName: string): Promise<ParseResult> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (mime === "application/pdf" || ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return { text: result.text.trim(), mime: "application/pdf" };
  }

  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value.trim(), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }

  // Plain text or unknown — treat as UTF-8.
  return { text: buffer.toString("utf-8").trim(), mime: mime || "text/plain" };
}

export { RESUMES_DIR };
