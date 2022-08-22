export default {
    /**
     * Clones a template from DOM by id
     */
    getTemplate: (id) => {
        return document.importNode(document.querySelector('template#' + id).content.firstElementChild, true);
    },

    /**
     * Set textContent of DOM node only if changed
     */
    setText: (node, text) => {
        text = '' + text;
        if (node.textContent !== text) node.textContent = text;
    },

    /**
     * Intelligent reordering/inserting/removing of DOM nodes based on a Map (with minimal changes to DOM)
     *
     * @param {Map} map The raw items
     * @param {Element} containerNode The parent DOM container of the list
     * @param {function} getNodeCb Must return the corresponding DOM node for one item - no matter if it is already in DOM
     * @param {function=} filterCb An optional filter function (return false if item should not be in the list)
     */
    syncDomNodeList: (map, containerNode, getNodeCb, filterCb) => {
        let previousSibling = null;

        map.forEach(item => {
            let node = getNodeCb(item);

            if (filterCb && !filterCb(item)) {
                if (node.parentNode) node.parentNode.removeChild(node);
            } else {
                if (node.parentNode) {
                    if (node.previousSibling !== previousSibling) {
                        node.parentNode.removeChild(node);
                    }
                }

                if (!node.parentNode) {
                    let refNode = previousSibling ? previousSibling.nextSibling : containerNode.firstChild;
                    containerNode.insertBefore(node, refNode);
                }
                previousSibling = node;
            }
        });
    },

    formatTime: (timestamp) => {
        if (timestamp === null) return '';
        return (new Date(timestamp)).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    },

    formatDuration: (duration) => {
        let isNegative = duration < 0;
        duration = Math.round(Math.abs(duration / 1000));

        let minutes = Math.floor(duration / 60);
        let seconds = duration - minutes * 60;
        let durationStr = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;

        return (isNegative ? '-' : '') + durationStr;
    },

    formatBytes: (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return (bytes / Math.pow(k, i)).toFixed(i > 0 ? decimals : 0) + ' ' + sizes[i];
    },

    pointInPolygon: (point, polygon) => {
        let x = point[0], y = point[1];
        let inside = false;
        let len = polygon.length;

        for (let i = 0, j = len - 1; i < len; j = i++) {
            let xi = polygon[i][0], yi = polygon[i][1];
            let xj = polygon[j][0], yj = polygon[j][1];

            let intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

            if (intersect) inside = !inside;
        }

        return inside;
    }
}
