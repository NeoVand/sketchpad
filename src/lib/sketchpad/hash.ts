/**
 * A streaming 64-bit fingerprint (two 32-bit lanes over little-endian 32-bit words, then the tail bytes and the
 * length). Not cryptographic: it names "the same files" for the certificate cache, and it runs at memory speed while
 * the weights download.
 */
export class StreamHash {
	private a = 0x811c9dc5;
	private b = 0x9e3779b9;
	private n = 0;
	private tail = new Uint8Array(4);
	private t = 0;

	private word(w: number) {
		this.a = Math.imul(this.a ^ w, 0x01000193);
		this.b = Math.imul(this.b ^ ((w << 13) | (w >>> 19)), 0x85ebca6b) ^ (this.b >>> 15);
	}

	update(chunk: Uint8Array) {
		let i = 0;
		this.n += chunk.length;
		if (this.t > 0) {
			while (this.t < 4 && i < chunk.length) this.tail[this.t++] = chunk[i++];
			if (this.t < 4) return;
			this.word(new DataView(this.tail.buffer).getUint32(0, true));
			this.t = 0;
		}
		const nw = (chunk.length - i) >>> 2;
		if (nw) {
			const off = chunk.byteOffset + i;
			const words =
				off % 4 === 0
					? new Uint32Array(chunk.buffer, off, nw)
					: new Uint32Array(chunk.slice(i, i + nw * 4).buffer);
			for (let k = 0; k < nw; k++) {
				const w = words[k];
				this.a = Math.imul(this.a ^ w, 0x01000193);
				this.b = Math.imul(this.b ^ ((w << 13) | (w >>> 19)), 0x85ebca6b) ^ (this.b >>> 15);
			}
			i += nw * 4;
		}
		while (i < chunk.length) this.tail[this.t++] = chunk[i++];
	}

	digest(): string {
		let a = this.a;
		for (let k = 0; k < this.t; k++) a = Math.imul(a ^ this.tail[k], 0x01000193);
		a = Math.imul(a ^ (this.n >>> 0), 0x01000193);
		const b = Math.imul(this.b ^ Math.floor(this.n / 2 ** 32), 0x85ebca6b);
		return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
	}
}

export function hashBytes(bytes: Uint8Array): string {
	const h = new StreamHash();
	h.update(bytes);
	return h.digest();
}

export const hashText = (s: string) => hashBytes(new TextEncoder().encode(s));
