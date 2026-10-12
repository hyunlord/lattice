const WORDS = 8, CHUNK = 65536;

/** Exact SHA-256 equality with chunked storage outside the JavaScript object heap. */
export class DigestIndex {
    private slots = new Uint32Array(1024);
    private digests: Uint32Array[] = [];
    private references: Float64Array[] = [];
    private count = 0;
    get size() { return this.count; }
    private hash(digest: Buffer) {
        if (digest.length !== 32) throw new Error('Expected a SHA-256 digest');
        let hash = 2166136261;
        for (let word = 0; word < WORDS; word++) hash = Math.imul(hash ^ digest.readUInt32LE(word * 4), 16777619);
        return hash >>> 0;
    }
    private locate(digest: Buffer, hash: number) {
        let slot = hash & (this.slots.length - 1);
        for (; ;) {
            const stored = this.slots[slot] ?? 0;
            if (!stored) return slot;
            const ordinal = stored - 1, chunk = this.digests[Math.floor(ordinal / CHUNK)]!;
            const offset = (ordinal % CHUNK) * WORDS;
            let equal = true;
            for (let word = 0; word < WORDS; word++) if (chunk[offset + word] !== digest.readUInt32LE(word * 4)) { equal = false; break; }
            if (equal) return slot;
            slot = (slot + 1) & (this.slots.length - 1);
        }
    }
    get(digest: Buffer): number | undefined {
        const stored = this.slots[this.locate(digest, this.hash(digest))] ?? 0;
        if (!stored) return undefined;
        const ordinal = stored - 1;
        return this.references[Math.floor(ordinal / CHUNK)]![ordinal % CHUNK];
    }
    private grow() {
        if (this.slots.length >= 0x40000000) throw new Error('Digest index capacity exceeded');
        const slots = new Uint32Array(this.slots.length * 2);
        for (let ordinal = 0; ordinal < this.count; ordinal++) {
            const chunk = this.digests[Math.floor(ordinal / CHUNK)]!, offset = (ordinal % CHUNK) * WORDS;
            let hash = 2166136261;
            for (let word = 0; word < WORDS; word++) hash = Math.imul(hash ^ chunk[offset + word]!, 16777619);
            let slot = hash & (slots.length - 1);
            while (slots[slot]) slot = (slot + 1) & (slots.length - 1);
            slots[slot] = ordinal + 1;
        }
        this.slots = slots;
    }
    set(digest: Buffer, reference: number) {
        if (!Number.isSafeInteger(reference) || reference < 0) throw new Error('Invalid packed reference ordinal');
        const hash = this.hash(digest);
        let slot = this.locate(digest, hash), stored = this.slots[slot] ?? 0;
        if (!stored) {
            if ((this.count + 1) * 4 > this.slots.length * 3) { this.grow(); slot = this.locate(digest, hash); }
            const ordinal = this.count++, chunkIndex = Math.floor(ordinal / CHUNK), offset = (ordinal % CHUNK) * WORDS;
            if (!this.digests[chunkIndex]) { this.digests.push(new Uint32Array(CHUNK * WORDS)); this.references.push(new Float64Array(CHUNK)); }
            for (let word = 0; word < WORDS; word++) this.digests[chunkIndex]![offset + word] = digest.readUInt32LE(word * 4);
            stored = ordinal + 1; this.slots[slot] = stored;
        }
        const ordinal = stored - 1;
        this.references[Math.floor(ordinal / CHUNK)]![ordinal % CHUNK] = reference;
    }
    clear() { this.slots = new Uint32Array(1024); this.digests = []; this.references = []; this.count = 0; }
}
