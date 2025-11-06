declare module 'ultravox-client' {
  export class UltravoxSession {
    status: 'disconnected' | 'disconnecting' | 'connecting' | 'idle' | 'listening' | 'thinking' | 'speaking';
    transcripts: Array<{
      speaker: 'user' | 'agent';
      text: string;
      isFinal?: boolean;
      medium?: 'voice' | 'text';
    }>;

    constructor(options?: { experimentalMessages?: string[] });
    
    addEventListener(
      event: 'status' | 'transcripts' | 'end' | 'error' | 'experimental_message',
      listener: (event?: any) => void
    ): void;

    joinCall(joinUrl: string, clientVersion?: string): void;
    leaveCall(): Promise<void>;
    
    sendText(text: string, deferResponse?: boolean): void;
    setOutputMedium(medium: 'text' | 'voice'): void;
    
    isMicMuted(): boolean;
    isSpeakerMuted(): boolean;
    muteMic(): void;
    unmuteMic(): void;
    muteSpeaker(): void;
    unmuteSpeaker(): void;
    
    registerToolImplementation(name: string, implementation: (parameters: any) => string | Promise<string> | { result: string; responseType?: string } | Promise<{ result: string; responseType?: string }>): void;
    registerToolImplementations(implementationMap: { [name: string]: (parameters: any) => string | Promise<string> | { result: string; responseType?: string } | Promise<{ result: string; responseType?: string }> }): void;
  }
}
