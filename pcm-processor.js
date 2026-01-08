/**
 * Google Gemini API - PCM Audio Processor
 * Adapts audio stream to 16kHz PCM for the Live API
 */
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const inputChannel = input[0];

        // Simple downsampling/buffering could happen here, 
        // but usually we rely on AudioContext sampleRate to be set to 16000
        // or we just pass the float data and convert in main thread.
        // For efficiency, let's buffer and send Float32 chunks.

        for (let i = 0; i < inputChannel.length; i++) {
            this.buffer[this.bufferIndex++] = inputChannel[i];

            if (this.bufferIndex >= this.bufferSize) {
                this.port.postMessage(this.buffer.slice());
                this.bufferIndex = 0;
            }
        }

        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);
