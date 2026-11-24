export function byId(id) {
  return document.getElementById(id);
}

export function element(tag, properties = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, properties);
  node.append(...children);
  return node;
}

export function openDialog(id) {
  const dialog = byId(id);
  dialog.returnValue = "";
  dialog.showModal();
}
