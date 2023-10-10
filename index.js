function camelCase(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, '');
}

function getComponentName(name) {
  return `${camelCase(name)}Comp`
}
let index = 0
function getEntityName(name) {
  return `${camelCase(name)}${index++}`
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
    case 'ObjectExpression':
      const { properties } = expression
    // console.log(expression)
    // return `${object.name}.${property.name}`
  }
}

function parseAttribute(value, componentName, prop) {
  if (value.type === 'JSXExpressionContainer' && value.expression.type === 'ObjectExpression') {
    const { properties } = value.expression
    return properties.map(p => {
      return `\n    ${getComponentName(componentName)}.${prop}.${p.key.name} = ${parseExpression(p.value)}`
    }).join('')
  }
  return `\n    ${getComponentName(componentName)}.${prop} = ${parseValue(value)}`
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
        let ret = `    const ${getComponentName(rootTag.name)} = ${rootTag.name}.create()`
        let refs = '';
        children.forEach(element => {
          const { openingElement, children, type } = element
          if (type !== 'JSXElement') return;
          const { attributes, name } = openingElement
          const componentName = name.name
          const entity = getEntityName(componentName)
          // ret += `\n    const ${entity} = world.entities.create()`
          ret += `\n    const ${getComponentName(componentName)} = ${componentName}.create()`
          attributes.forEach(({ name, value }) => {
            if (name.name === 'ref') {
              refs += `\n    ${getComponentName(currentClassName)}.${value.value} = ${getComponentName(componentName)}`
            } else {
              ret += parseAttribute(value, componentName, name.name)
            }
          })
          ret += `\n     ${getComponentName(rootTag.name)}.addChild(${getComponentName(componentName)}.node)`
        });
        attributes.forEach(({ name, value }) => {
          if (name.name === 'ref') {
            refs += `\n    ${getComponentName(currentClassName)}.${value.value} = ${getComponentName(rootTag.name)}`
          } else {
            ret += parseAttribute(value, rootTag.name, name.name)
          }
        })
        ret += `\n   const ${getComponentName(currentClassName)} = ${getComponentName(rootTag.name)}.addComponent(new ${currentClassName}())
        ${refs}
        return ${getComponentName(currentClassName)}`
        console.log(currentClassName, ret.length)
        path.replaceWithSourceString(`function () {
          ${ret}
        }()`);
      }
    },
  }
}
