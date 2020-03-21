Object.defineProperty(Array.prototype, 'chunk', { value: function(n) {
    return Array.from(Array(Math.ceil(this.length / n)), (_, i) => this.slice(i * n, (i + 1) * n));
}});
