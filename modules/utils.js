export default {
    /**
     * Clones a template from DOM by id
     */
    getTemplate: (id) => {
        return document.importNode(document.querySelector('template#' + id).content.firstElementChild, true);
    },

    /**
     * Intelligent reordering/inserting/removing of DOM nodes based on a Map (with minimal changes to DOM)
     *
     * @param {Map} map The items need a "._gui.node" property with the DOM node - no matter if it is already in DOM
     * @param {Element} containerNode The parent DOM container of the list
     * @param {function=} filterCb An optional filter function (return false if item should not be in the list)
     */
    syncDomNodeList: (map, containerNode, filterCb) => {
        let previousSibling = null;

        map.forEach(item => {
            if (filterCb && !filterCb(item)) {
                if (item._gui.node.parentNode) item._gui.node.parentNode.removeChild(item._gui.node);
            } else {
                if (item._gui.node.parentNode) {
                    if (item._gui.node.previousSibling !== previousSibling) {
                        item._gui.node.parentNode.removeChild(item._gui.node);
                    }
                }

                if (!item._gui.node.parentNode) {
                    let refNode = previousSibling ? previousSibling.nextSibling : containerNode.firstChild;
                    containerNode.insertBefore(item._gui.node, refNode);
                }
                previousSibling = item._gui.node;
            }
        });
    }
}
