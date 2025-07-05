import { Response } from 'express';
import { SSEChunk } from '../types/index.js';

export class StreamingResponseHandler {
  private response: Response;
  private isClientDisconnected: boolean = false;

  constructor(response: Response) {
    this.response = response;
    this.setupSSE();
    this.handleClientDisconnection();
  }

  /**
   * Set up Server-Sent Events headers
   */
  private setupSSE(): void {
    this.response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
  }

  /**
   * Handle client disconnection
   */
  private handleClientDisconnection(): void {
    this.response.on('close', () => {
      this.isClientDisconnected = true;
      console.log('Client disconnected from stream');
    });

    this.response.on('error', (error) => {
      this.isClientDisconnected = true;
      console.error('Streaming response error:', error);
    });
  }

  /**
   * Send streaming data chunk
   */
  sendChunk(data: string, event?: string, id?: string): boolean {
    if (this.isClientDisconnected) {
      return false;
    }

    try {
      const chunk: SSEChunk = { data, event, id };
      this.writeSSEChunk(chunk);
      return true;
    } catch (error) {
      console.error('Error sending chunk:', error);
      this.isClientDisconnected = true;
      return false;
    }
  }

  /**
   * Send message chunk for chat streaming
   */
  sendMessageChunk(content: string, messageId?: string): boolean {
    return this.sendChunk(content, 'message', messageId);
  }

  /**
   * Send typing indicator
   */
  sendTypingStart(): boolean {
    return this.sendChunk('', 'typing_start');
  }

  sendTypingStop(): boolean {
    return this.sendChunk('', 'typing_stop');
  }

  /**
   * Send completion signal
   */
  sendComplete(finalData?: string): boolean {
    if (finalData) {
      this.sendChunk(finalData, 'complete');
    } else {
      this.sendChunk('', 'complete');
    }
    return true;
  }

  /**
   * Send error to client
   */
  sendError(error: string | Error): boolean {
    let errorMessage = 'An error occurred';
    
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return this.sendChunk(JSON.stringify({ error: errorMessage }), 'error');
  }

  /**
   * Close the stream
   */
  close(): void {
    if (!this.isClientDisconnected) {
      try {
        this.response.end();
      } catch (error) {
        console.error('Error closing stream:', error);
      }
    }
  }

  /**
   * Check if client is still connected
   */
  isConnected(): boolean {
    return !this.isClientDisconnected;
  }

  /**
   * Stream async iterator (for AI responses)
   */
  async streamAsyncIterator(
    iterator: AsyncIterableIterator<string>,
    options?: {
      onChunk?: (chunk: string) => void;
      onComplete?: () => void;
      onError?: (error: Error) => void;
    }
  ): Promise<void> {
    try {
      this.sendTypingStart();

      for await (const chunk of iterator) {
        if (!this.isConnected()) {
          break;
        }

        const sent = this.sendMessageChunk(chunk);
        if (!sent) {
          break;
        }

        // Optional callback for processing chunks
        if (options?.onChunk) {
          options.onChunk(chunk);
        }

        // Small delay to prevent overwhelming the client
        await this.sleep(10);
      }

      this.sendTypingStop();
      this.sendComplete();
      
      if (options?.onComplete) {
        options.onComplete();
      }

    } catch (error) {
      console.error('Error streaming async iterator:', error);
      this.sendError(error instanceof Error ? error : new Error(String(error)));
      
      if (options?.onError) {
        options.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.close();
    }
  }

  /**
   * Private helper methods
   */

  private writeSSEChunk(chunk: SSEChunk): void {
    let output = '';

    if (chunk.event) {
      output += `event: ${chunk.event}\n`;
    }

    if (chunk.id) {
      output += `id: ${chunk.id}\n`;
    }

    if (chunk.retry) {
      output += `retry: ${chunk.retry}\n`;
    }

    // Handle multi-line data
    const dataLines = chunk.data.split('\n');
    for (const line of dataLines) {
      output += `data: ${line}\n`;
    }

    output += '\n';

    this.response.write(output);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Utility function to create streaming response handler
 */
export const createStreamingResponse = (response: Response): StreamingResponseHandler => {
  return new StreamingResponseHandler(response);
}; 