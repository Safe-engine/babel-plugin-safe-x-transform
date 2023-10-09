function camelCase(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, '');
}

function getComponentName(name) {
  return `${camelCase(name)}Comp`
}

function parseValue(value) {
  const { type, expression } = value
  switch (type) {
    case 'JSXExpressionContainer': {
      return expression.extra.raw
    }
    case 'StringLiteral': {
      return value.extra.raw
    }
  }
}

module.exports = function () {
  return {
    visitor: {
      ClassDeclaration(path) {
        console.log(path.node)
        const currentClassName = path.node.id.name
        path.traverse({
          JSXElement(path) {
            const { openingElement, children } = path.node
            const { attributes, name } = openingElement
            let ret = `    const world = GameWorld.Instance
    const root = world.entities.create()
    const ${getComponentName(currentClassName)} = root.assign(new ${currentClassName}())`
            children.forEach(element => {
              const { openingElement, children, type } = element
              if (type !== 'JSXElement') return;
              const { attributes, name } = openingElement
              const componentName = name.name
              attributes.forEach(({ name, value }) => {
                ret += `\n    const ${getComponentName(componentName)} = root.assign(new ${componentName}(${parseValue(value)}))`
                if (name.name === 'ref') {
                  ret += `\n    ${getComponentName(currentClassName)}.${value.value} = ${getComponentName(componentName)}`
                }
              })
            });
            attributes.forEach(({ name, value }) => {
              ret += `\n    ${getComponentName(currentClassName)}.${name.name} = ${parseValue(value)}`
            })
            path.replaceWithSourceString(ret);
          }
        })
      },
    },
  }
}
