import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { marked } from 'marked';

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  async convertMarkdownToPdf(
    markdown: string,
    options?: {
      format?: 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5' | 'A6';
      landscape?: boolean;
      margin?: {
        top?: string;
        right?: string;
        bottom?: string;
        left?: string;
      };
    },
  ): Promise<Buffer> {
    try {
      // Convert markdown to HTML
      const html = await this.markdownToHtml(markdown);

      // Launch Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Set the HTML content with custom CSS
      await page.setContent(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 100%;
                padding: 2rem;
                margin: 0;
              }
              h1 {
                color: #2c3e50;
                border-bottom: 2px solid #3498db;
                padding-bottom: 0.3rem;
                margin-bottom: 1rem;
              }
              h2 {
                color: #34495e;
                margin-top: 1.5rem;
                margin-bottom: 0.8rem;
              }
              h3, h4, h5, h6 {
                color: #34495e;
                margin-top: 1rem;
                margin-bottom: 0.6rem;
              }
              code {
                background-color: #f4f4f4;
                padding: 0.2rem 0.4rem;
                border-radius: 3px;
                font-family: 'Courier New', Courier, monospace;
              }
              pre {
                background-color: #f4f4f4;
                padding: 1rem;
                border-radius: 5px;
                overflow-x: auto;
                line-height: 1.4;
              }
              pre code {
                background-color: transparent;
                padding: 0;
              }
              blockquote {
                border-left: 4px solid #3498db;
                padding-left: 1rem;
                margin-left: 0;
                font-style: italic;
                color: #555;
              }
              table {
                border-collapse: collapse;
                width: 100%;
                margin: 1rem 0;
              }
              th, td {
                border: 1px solid #ddd;
                padding: 0.75rem;
                text-align: left;
              }
              th {
                background-color: #f4f4f4;
                font-weight: bold;
              }
              tr:nth-child(even) {
                background-color: #f9f9f9;
              }
              a {
                color: #3498db;
                text-decoration: none;
              }
              a:hover {
                text-decoration: underline;
              }
              img {
                max-width: 100%;
                height: auto;
              }
              ul, ol {
                margin: 0.5rem 0;
                padding-left: 2rem;
              }
              li {
                margin: 0.25rem 0;
              }
              hr {
                border: none;
                border-top: 1px solid #ddd;
                margin: 1.5rem 0;
              }
            </style>
          </head>
          <body>
            ${html}
          </body>
        </html>
      `,
        { waitUntil: 'networkidle0' },
      );

      // Generate PDF
      const pdf = await page.pdf({
        format: options?.format || 'A4',
        landscape: options?.landscape || false,
        printBackground: true,
        margin: options?.margin || {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm',
        },
      });

      await browser.close();

      return Buffer.from(pdf);
    } catch (error) {
      this.logger.error('Error converting markdown to PDF:', error);
      throw new Error(`Failed to convert markdown to PDF: ${error.message}`);
    }
  }

  private async markdownToHtml(markdown: string): Promise<string> {
    try {
      // Configure marked options
      marked.setOptions({
        breaks: true,
        gfm: true, // GitHub Flavored Markdown
      });

      // Convert markdown to HTML
      const html = await marked.parse(markdown);
      return html;
    } catch (error) {
      this.logger.error('Error converting markdown to HTML:', error);
      throw new Error(`Failed to convert markdown to HTML: ${error.message}`);
    }
  }
}
