const Anthropic = require('@anthropic-ai/sdk');

class AIService {
  constructor(logger) {
    this.logger = logger;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    if (!process.env.ANTHROPIC_API_KEY) {
      this.logger.error('ANTHROPIC_API_KEY not found in environment variables');
      throw new Error('ANTHROPIC_API_KEY is required');
    }
  }

  async sendMessage(content, model = 'claude-3-5-sonnet-20241022', systemInstructions = '') {
    try {
      this.logger.info(`Sending message to ${model}`, {
        contentLength: content.length,
        hasSystemInstructions: !!systemInstructions
      });

      const messages = [
        {
          role: 'user',
          content: content
        }
      ];

      const requestParams = {
        model: model,
        max_tokens: 4096,
        messages: messages
      };

      // Add system instructions if provided
      if (systemInstructions && systemInstructions.trim()) {
        requestParams.system = systemInstructions;
      }

      const response = await this.anthropic.messages.create(requestParams);

      if (!response.content || response.content.length === 0) {
        throw new Error('Empty response from AI service');
      }

      const responseText = response.content[0].text;
      
      this.logger.info(`Received AI response`, {
        model: model,
        responseLength: responseText.length,
        usage: response.usage
      });

      return responseText;

    } catch (error) {
      this.logger.error('AI Service error:', {
        error: error.message,
        model: model,
        contentLength: content.length
      });

      if (error.status === 401) {
        throw new Error('Invalid API key. Please check your ANTHROPIC_API_KEY.');
      } else if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.status === 400) {
        throw new Error(`Bad request: ${error.message}`);
      } else if (error.status >= 500) {
        throw new Error('AI service temporarily unavailable. Please try again later.');
      } else {
        throw new Error(`AI service error: ${error.message}`);
      }
    }
  }

  async streamMessage(content, model = 'claude-3-5-sonnet-20241022', systemInstructions = '', onChunk) {
    try {
      this.logger.info(`Starting streaming message to ${model}`, {
        contentLength: content.length,
        hasSystemInstructions: !!systemInstructions
      });

      const messages = [
        {
          role: 'user',
          content: content
        }
      ];

      const requestParams = {
        model: model,
        max_tokens: 4096,
        messages: messages,
        stream: true
      };

      // Add system instructions if provided
      if (systemInstructions && systemInstructions.trim()) {
        requestParams.system = systemInstructions;
      }

      const stream = await this.anthropic.messages.create(requestParams);
      let fullResponse = '';

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.text) {
          const text = chunk.delta.text;
          fullResponse += text;
          
          if (onChunk) {
            onChunk(text);
          }
        } else if (chunk.type === 'message_stop') {
          this.logger.info('Streaming completed', {
            model: model,
            totalLength: fullResponse.length
          });
          break;
        } else if (chunk.type === 'error') {
          throw new Error(`Streaming error: ${chunk.error.message}`);
        }
      }

      return fullResponse;

    } catch (error) {
      this.logger.error('AI Streaming error:', {
        error: error.message,
        model: model,
        contentLength: content.length
      });

      if (error.status === 401) {
        throw new Error('Invalid API key. Please check your ANTHROPIC_API_KEY.');
      } else if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.status === 400) {
        throw new Error(`Bad request: ${error.message}`);
      } else if (error.status >= 500) {
        throw new Error('AI service temporarily unavailable. Please try again later.');
      } else {
        throw new Error(`AI streaming error: ${error.message}`);
      }
    }
  }

  validateModel(model) {
    const validModels = ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'];
    if (!validModels.includes(model)) {
      throw new Error(`Invalid model: ${model}. Valid models: ${validModels.join(', ')}`);
    }
    return true;
  }

  getAvailableModels() {
    return [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Most capable model, best for complex tasks'
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: 'Fast and efficient, good for simple tasks'
      }
    ];
  }
}

module.exports = AIService;
