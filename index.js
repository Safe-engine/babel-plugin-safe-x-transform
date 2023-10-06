module.exports = function () {
  return {
    visitor: {
      JSXElement(path) {
        const name = path.node.openingElement.name.name
        // reverse the name: JavaScript -> tpircSavaJ
        // path.node.name = name.split('').reverse().join('')
        console.log(name)
        path.replaceWithSourceString(`function ${name}(a, b) {
          return a + b;
        }`);
      },
    },
  }
}
