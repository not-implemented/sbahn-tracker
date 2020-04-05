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
    }
}
