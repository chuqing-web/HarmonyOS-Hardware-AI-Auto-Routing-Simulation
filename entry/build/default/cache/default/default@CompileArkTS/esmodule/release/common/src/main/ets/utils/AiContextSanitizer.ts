export class AiContextSanitizer {
    static sanitizePrompt(e12: string): string {
        let f12 = e12;
        f12 = f12.replace(/\b[xX]\s*[:=]?\s*\d+(\.\d+)?/g, 'x=<coord>');
        f12 = f12.replace(/\b[yY]\s*[:=]?\s*\d+(\.\d+)?/g, 'y=<coord>');
        f12 = f12.replace(/P\d+\.\d+/g, 'P<n>.<m>');
        f12 = f12.replace(/0x[0-9A-Fa-f]{4,8}/g, '0x<addr>');
        f12 = f12.replace(/\b\d{1,4}\s*mil\b/gi, '<dist>mil');
        return f12;
    }
    static sanitizeTopologyJson(d12: string): string {
        return AiContextSanitizer.sanitizePrompt(d12)
            .replace(/"x"\s*:\s*[\d.]+/g, '"x":0')
            .replace(/"y"\s*:\s*[\d.]+/g, '"y":0');
    }
}
