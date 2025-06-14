import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { 
    AIProvider, 
    AIProviderSettings, 
    AIVendor, 
    ModelAvailabilityInfo, 
    ModelAvailabilityStatus,
    showErrorNotice,
    ContentPart
} from './base-provider';

/**
 * Map of known Gemini models and their availability status
 */
export const GEMINI_MODEL_AVAILABILITY: Record<string, ModelAvailabilityInfo> = {
    // Gemini 1.5 models - generally available
    'gemini-1.5-pro': { status: ModelAvailabilityStatus.GENERALLY_AVAILABLE },
    'gemini-1.5-flash': { status: ModelAvailabilityStatus.GENERALLY_AVAILABLE },
    'gemini-1.5-flash-8b': { status: ModelAvailabilityStatus.GENERALLY_AVAILABLE },
    
    // Gemini 2.0 models - generally available
    'gemini-2.0-flash': { status: ModelAvailabilityStatus.GENERALLY_AVAILABLE },
    'gemini-2.0-flash-lite': { status: ModelAvailabilityStatus.GENERALLY_AVAILABLE },
    'gemini-2.0-flash-preview-image-generation': { 
        status: ModelAvailabilityStatus.LIMITED_PREVIEW,
        reason: 'This image generation model may require special access.',
        fallbackModel: 'gemini-2.0-flash'
    },
    'gemini-2.0-flash-live-001': { status: ModelAvailabilityStatus.GENERALLY_AVAILABLE },
    
    // Gemini 2.5 models - preview/limited availability
    'gemini-2.5-pro-preview-05-06': { 
        status: ModelAvailabilityStatus.LIMITED_PREVIEW, 
        reason: 'This is a preview model with limited availability. Your API key may not have access to it yet.',
        fallbackModel: 'gemini-1.5-pro'
    },
    'gemini-2.5-flash-preview-05-20': { 
        status: ModelAvailabilityStatus.LIMITED_PREVIEW, 
        reason: 'This is a preview model with limited availability. Your API key may not have access to it yet.',
        fallbackModel: 'gemini-1.5-flash'
    },
    'gemini-2.5-flash-preview-tts': { 
        status: ModelAvailabilityStatus.LIMITED_PREVIEW, 
        reason: 'This text-to-speech model has limited availability. Your API key may not have access to it yet.',
        fallbackModel: 'gemini-1.5-flash'
    },
    'gemini-2.5-pro-preview-tts': { 
        status: ModelAvailabilityStatus.LIMITED_PREVIEW, 
        reason: 'This text-to-speech model has limited availability. Your API key may not have access to it yet.',
        fallbackModel: 'gemini-1.5-pro'
    },
    'gemini-2.5-flash-preview-native-audio-dialog': { 
        status: ModelAvailabilityStatus.EXPERIMENTAL, 
        reason: 'This audio model has limited availability. Your API key may not have access to it yet.',
        fallbackModel: 'gemini-1.5-flash'
    },
    'gemini-2.5-flash-exp-native-audio-thinking-dialog': { 
        status: ModelAvailabilityStatus.EXPERIMENTAL, 
        reason: 'This experimental audio model has limited availability. Your API key may not have access to it yet.',
        fallbackModel: 'gemini-1.5-flash'
    },
    
    // Legacy model
    'gemini-pro': { 
        status: ModelAvailabilityStatus.DEPRECATED, 
        reason: 'This model is deprecated and may be removed in the future. Consider using a Gemini 1.5 or newer model.',
        fallbackModel: 'gemini-1.5-pro'
    }
};

/**
 * Check if a Gemini model is likely to be available based on our knowledge
 * @param modelName The model name to check
 * @returns Information about the model's availability
 */
export function checkGeminiModelAvailability(modelName: string): ModelAvailabilityInfo {
    // Check if we have specific information about this model
    if (modelName in GEMINI_MODEL_AVAILABILITY) {
        return GEMINI_MODEL_AVAILABILITY[modelName];
    }
    
    // If we don't have specific information, make an educated guess based on the model name
    if (modelName.includes('preview') || modelName.includes('exp')) {
        return {
            status: ModelAvailabilityStatus.LIMITED_PREVIEW,
            reason: 'This appears to be a preview or experimental model that may have limited availability.',
            fallbackModel: inferGeminiFallbackModel(modelName)
        };
    }
    
    if (modelName.includes('2.5')) {
        return {
            status: ModelAvailabilityStatus.LIMITED_PREVIEW,
            reason: 'Gemini 2.5 models are currently in limited preview and may not be available with your API key.',
            fallbackModel: inferGeminiFallbackModel(modelName)
        };
    }
    
    // For any other model, we assume it might be available but mark it as unknown
    return {
        status: ModelAvailabilityStatus.UNKNOWN,
        reason: 'This model is not in our database. It may or may not be available with your API key.'
    };
}

/**
 * Try to infer a reasonable fallback model based on the model name
 * @param modelName The original model name
 * @returns A suggested fallback model
 */
function inferGeminiFallbackModel(modelName: string): string {
    // If it's a pro model, suggest gemini-1.5-pro as fallback
    if (modelName.includes('pro')) {
        return 'gemini-1.5-pro';
    }
    
    // Otherwise suggest gemini-1.5-flash as a general fallback
    return 'gemini-1.5-flash';
}

/**
 * Implementation of the AIProvider interface for Google's Gemini models
 */
export class GeminiProvider implements AIProvider {
    private genAI: GoogleGenerativeAI;
    private model: GenerativeModel;
    private settings: AIProviderSettings;

    constructor(apiKey: string, settings: AIProviderSettings) {
        this.settings = settings;
        this.genAI = new GoogleGenerativeAI(apiKey);
        
        // Format the model name correctly for the API
        // The settings.model is the base model name (e.g., 'gemini-1.5-pro')
        // But the API expects a full path (e.g., 'models/gemini-1.5-pro')
        const apiModelPath = `models/${this.settings.model}`;
        
        console.log(`Initializing Gemini model: ${this.settings.model} (API path: ${apiModelPath})`);
        this.model = this.genAI.getGenerativeModel({ model: apiModelPath });
    }

    /**
     * Generate content using the Gemini API
     * @param prompt The prompt to send to Gemini
     * @returns The generated content
     */
    async generateContent(prompt: string): Promise<string> {
        try {
            console.log(`Generating content with model: ${this.settings.model}, temperature: ${this.settings.temperature}`);
            
            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: this.settings.temperature,
                    maxOutputTokens: this.settings.maxTokens,
                }
            });
            
            return result.response.text();
        } catch (error: any) {
            console.error('Error generating content with Gemini:', error);
            
            // Get model information for better error messages
            const modelInfo = checkGeminiModelAvailability(this.settings.model);
            
            // Provide more specific error messages for common issues
            if (error.message && error.message.includes('404')) {
                // Model not found - provide specific guidance based on model status
                let errorMessage = `Model not available: ${this.settings.model}.`;
                
                if (modelInfo.status === ModelAvailabilityStatus.LIMITED_PREVIEW || 
                    modelInfo.status === ModelAvailabilityStatus.EXPERIMENTAL) {
                    // Known limited availability model
                    errorMessage += ` ${modelInfo.reason || 'This model has limited availability.'}`;
                    
                    // Suggest a fallback model if available
                    if (modelInfo.fallbackModel) {
                        errorMessage += ` Try using ${modelInfo.fallbackModel} instead.`;
                    } else {
                        errorMessage += ` Try using a Gemini 1.5 or 2.0 model instead.`;
                    }
                } else if (modelInfo.status === ModelAvailabilityStatus.UNKNOWN) {
                    // Unknown model
                    errorMessage += ` This model may not exist or may not be available with your API key. Try using a known model like gemini-1.5-pro instead.`;
                } else {
                    // Generally available model that should work but doesn't
                    errorMessage += ` This is unexpected as this model should be available. Please check your API key permissions or try a different model.`;
                }
                
                // Show error in UI
                showErrorNotice(errorMessage, 10000);
                
                throw new Error(errorMessage);
            } else if (error.message && (error.message.includes('401') || error.message.includes('403'))) {
                const errorMessage = 'Authentication failed. Please check your API key in settings.';
                showErrorNotice(errorMessage, 10000);
                throw new Error(errorMessage);
            } else if (error.message && error.message.includes('429')) {
                const errorMessage = 'Rate limit exceeded. Please try again later.';
                showErrorNotice(errorMessage, 10000);
                throw new Error(errorMessage);
            } else if (error.message && error.message.includes('invalid_request')) {
                // More specific handling for invalid requests
                let errorMessage = `Invalid request: ${error.message}.`;
                
                // Check if this might be due to model capabilities
                if (error.message.includes('image') || error.message.includes('multimodal')) {
                    errorMessage += ` This may be because you're trying to use features not supported by this model. Check if you need a multimodal-capable model.`;
                } else if (error.message.includes('token') || error.message.includes('length')) {
                    errorMessage += ` This may be due to exceeding token limits. Try reducing your input or output token settings.`;
                } else {
                    errorMessage += ` This may be due to an incompatible model configuration.`;
                }
                
                showErrorNotice(errorMessage, 10000);
                throw new Error(errorMessage);
            } else if (error.message && error.message.includes('not_found')) {
                const errorMessage = `API endpoint not found. This could indicate an issue with the Gemini API service or an invalid model name: ${this.settings.model}.`;
                showErrorNotice(errorMessage, 10000);
                throw new Error(errorMessage);
            } else if (error.message && error.message.includes('permission_denied')) {
                const errorMessage = `Permission denied. Your API key may not have access to the ${this.settings.model} model. Try a different model or check your API key permissions.`;
                showErrorNotice(errorMessage, 10000);
                throw new Error(errorMessage);
            } else if (error.message && error.message.includes('resource_exhausted')) {
                const errorMessage = `Resource exhausted. You may have exceeded your quota for the ${this.settings.model} model. Check your Google AI Studio dashboard for quota information.`;
                showErrorNotice(errorMessage, 10000);
                throw new Error(errorMessage);
            } else {
                const errorMessage = `Failed to generate content: ${error.message}`;
                showErrorNotice(errorMessage, 10000);
                throw new Error(errorMessage);
            }
        }
    }

    /**
     * Check if the API key is valid by making a simple request
     * @returns True if the API key is valid, false otherwise
     */
    /**
     * Generate content using multi-modal inputs (text and images)
     * @param prompt The text prompt to send to the AI
     * @param parts Additional content parts (e.g., images as base64)
     * @returns The generated content
     */
    async generateMultiModalContent(prompt: string, parts: ContentPart[]): Promise<string> {
        try {
            console.log(`Generating multi-modal content with model: ${this.settings.model}`);
            
            // Build the parts array for the Gemini API
            // The first part should be the text prompt
            const geminiParts: any[] = [
                { text: prompt }
            ];
            
            // Add any additional parts (like images)
            for (const part of parts) {
                if (part.type === 'image') {
                    // Add the image as a mimePart
                    geminiParts.push({
                        inlineData: {
                            data: part.data,  // Base64 encoded image data
                            mimeType: 'image/jpeg'  // Assuming JPEG for now, could be made dynamic
                        }
                    });
                } else if (part.type === 'text') {
                    // Add additional text parts
                    geminiParts.push({ text: part.data });
                }
            }
            
            // Generate content with the text and image parts
            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: geminiParts }],
                generationConfig: {
                    temperature: this.settings.temperature,
                    maxOutputTokens: this.settings.maxTokens,
                }
            });
            
            return result.response.text();
        } catch (error: any) {
            console.error('Error generating multi-modal content with Gemini:', error);
            
            // Handle specific errors for multi-modal content
            if (error.message && error.message.includes('multimodal')) {
                const errorMessage = `This model doesn't support multi-modal input. Try using gemini-1.5-pro or another model with multi-modal capabilities.`;
                showErrorNotice(errorMessage, 10000);
                throw new Error(errorMessage);
            }
            
            // Reuse the same error handling as generateContent
            throw this.handleGeminiError(error);
        }
    }
    
    /**
     * Handle Gemini API errors with detailed error messages
     */
    private handleGeminiError(error: any): Error {
        // Get model information for better error messages
        const modelInfo = checkGeminiModelAvailability(this.settings.model);
        
        // Provide more specific error messages for common issues
        if (error.message && error.message.includes('404')) {
            // Model not found - provide specific guidance based on model status
            let errorMessage = `Model not available: ${this.settings.model}.`;
            
            if (modelInfo.status === ModelAvailabilityStatus.LIMITED_PREVIEW || 
                modelInfo.status === ModelAvailabilityStatus.EXPERIMENTAL) {
                // Known limited availability model
                errorMessage += ` ${modelInfo.reason || 'This model has limited availability.'}`;
                
                // Suggest a fallback model if available
                if (modelInfo.fallbackModel) {
                    errorMessage += ` Try using ${modelInfo.fallbackModel} instead.`;
                } else {
                    errorMessage += ` Try using a Gemini 1.5 or 2.0 model instead.`;
                }
            } else if (modelInfo.status === ModelAvailabilityStatus.UNKNOWN) {
                // Unknown model
                errorMessage += ` This model may not exist or may not be available with your API key. Try using a known model like gemini-1.5-pro instead.`;
            } else {
                // Generally available model that should work but doesn't
                errorMessage += ` This is unexpected as this model should be available. Please check your API key permissions or try a different model.`;
            }
            
            // Show error in UI
            showErrorNotice(errorMessage, 10000);
            
            return new Error(errorMessage);
        } else if (error.message && (error.message.includes('401') || error.message.includes('403'))) {
            const errorMessage = 'Authentication failed. Please check your API key in settings.';
            showErrorNotice(errorMessage, 10000);
            return new Error(errorMessage);
        } else if (error.message && error.message.includes('429')) {
            const errorMessage = 'Rate limit exceeded. Please try again later.';
            showErrorNotice(errorMessage, 10000);
            return new Error(errorMessage);
        } else if (error.message && error.message.includes('invalid_request')) {
            // More specific handling for invalid requests
            let errorMessage = `Invalid request: ${error.message}.`;
            
            // Check if this might be due to model capabilities
            if (error.message.includes('image') || error.message.includes('multimodal')) {
                errorMessage += ` This may be because you're trying to use features not supported by this model. Check if you need a multimodal-capable model.`;
            } else if (error.message.includes('token') || error.message.includes('length')) {
                errorMessage += ` This may be due to exceeding token limits. Try reducing your input or output token settings.`;
            } else {
                errorMessage += ` This may be due to an issue with your prompt or settings.`;
            }
            
            showErrorNotice(errorMessage, 10000);
            return new Error(errorMessage);
        }
        
        // Generic error fallback
        const errorMessage = `Error with Gemini API: ${error.message || 'Unknown error'}`;
        showErrorNotice(errorMessage, 5000);
        return new Error(errorMessage);
    }

    async isApiKeyValid(): Promise<boolean> {
        try {
            await this.generateContent('Hello, please respond with "API key is valid" if you can read this message.');
            return true;
        } catch (error) {
            console.error('API key validation failed:', error);
            return false;
        }
    }
    
    /**
     * Get the vendor of this provider
     * @returns The AI vendor (Google)
     */
    getVendor(): AIVendor {
        return AIVendor.GOOGLE;
    }

    /**
     * Get the display name of the provider
     * @returns The provider's display name
     */
    getProviderName(): string {
        return 'Google Gemini';
    }
}
