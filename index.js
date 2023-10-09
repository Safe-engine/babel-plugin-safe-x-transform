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
      return parseExpression(expression)
    }
    case 'StringLiteral': {
      return value.extra.raw
    }
  }
}

function parseExpression(expression) {
  const { type, extra, object, property } = expression
  switch (type) {
    case 'NumericLiteral':
      return extra.raw
    case 'MemberExpression':
      return `${object.name}.${property.name}`
  }
}

let currentClassName;
module.exports = function () {
  return {
    visitor: {
      ClassDeclaration(path) {
        // console.log(path.node)
        currentClassName = path.node.id.name
      },
      JSXElement(path) {
        const { openingElement, children } = path.node
        const { attributes, name: rootTag } = openingElement
        let ret = `    const world = GameWorld.Instance
          const root = world.entities.create()`
        let refs = '';
        children.forEach(element => {
          const { openingElement, children, type } = element
          if (type !== 'JSXElement') return;
          const { attributes, name } = openingElement
          const componentName = name.name
          ret += `\n    const ${getComponentName(componentName)} = root.assign(new ${componentName}())`
          attributes.forEach(({ name, value }) => {
            if (name.name === 'ref') {
              refs += `\n    ${getComponentName(currentClassName)}.${value.value} = ${getComponentName(componentName)}`
            } else {
              ret += `\n    ${getComponentName(componentName)}.${name.name} = ${parseValue(value)}`
            }
          })
        });
        ret += `\n    const ${getComponentName(rootTag.name)} = root.getComponent(${rootTag.name})`
        attributes.forEach(({ name, value }) => {
          ret += `\n    ${getComponentName(rootTag.name)}.${name.name} = ${parseValue(value)}`
        })
        ret += `\n   const ${getComponentName(currentClassName)} = root.assign(new ${currentClassName}())
        ${refs}
        return ${getComponentName(currentClassName)}`
        console.log(currentClassName, ret)
        path.replaceWithSourceString(`function () {
          ${ret}
        }()`);
      }
    },
  }
}
