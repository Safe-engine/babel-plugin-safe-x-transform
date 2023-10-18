// const fs = require('fs')
// const content = fs.readFileSync('./package.json', 'utf8')
// console.log(content)
const physicsCompList = ['BoxCollider', 'CircleCollider', 'PolygonCollider']
const paramsFirstCompList = [
  ...physicsCompList,
  'SpineSkeleton'
]
const noRenderList = [
  ...physicsCompList,
  'ButtonComp', 'RigidBody', 'Collider',
];

function isNoRender(name) {
  return noRenderList.includes(name);
}

function camelCase(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, '');
}
const nameCount = {}
function getComponentName(name) {
  if (!nameCount[name])
    nameCount[name] = 0
  return `${camelCase(name)}Comp${++nameCount[name]}`
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
    case 'NumericLiteral': {
      return value.value
    }
  }
}

function parseExpression(expression) {
  const { type, extra, object, property, value } = expression
  switch (type) {
    case 'BooleanLiteral':
      return value
    case 'StringLiteral':
    case 'NumericLiteral':
      return extra.raw
    case 'MemberExpression':
      return `${object.name}.${property.name}`
    case 'CallExpression':
      const { callee, arguments } = expression
      return `${callee.name}(${arguments.map(parseValue).join(', ')})`
  }
}

function parseAttribute(value, componentVar, prop) {
  if (value.type === 'JSXExpressionContainer' && value.expression.type === 'ObjectExpression') {
    const { properties } = value.expression
    return properties.map(p => {
      return `\n    ${componentVar}.${prop}.${p.key.name} = ${parseExpression(p.value)}`
    }).join('')
  }
  return `\n    ${componentVar}.${prop} = ${parseValue(value)}`
}

function attributesToParams(attributes) {
  let props = ''
  attributes.map(({ name, value }) => {
    const attName = name.name
    if (attName === 'node' || attName.includes('$')) return
    props += `${attName}: ${parseValue(value)},`
  })
  return `{${props}}`
}

let currentClassName;
module.exports = function () {
  return {
    // inherits: require("@babel/plugin-syntax-jsx"),
    pre(state) {
      this.cache = new Map();
    },
    visitor: {
      ClassDeclaration(path) {
        // console.log(path.node)
        currentClassName = path.node.id.name
      },
      JSXElement(path) {
        const { openingElement, children } = path.node
        const { attributes, name: rootTag } = openingElement
        let ret = ''
        let refs = '';
        const classVar = getComponentName(currentClassName)
        function parseJSX(tagName, children, attributes, parentVar) {
          // console.log('parseJSX', tagName)
          const componentName = tagName.name
          const compVar = getComponentName(componentName)
          if (!parentVar) {
            refs += `\n   const ${classVar} = ${compVar}.addComponent(new ${currentClassName}())`
          }
          const isParamsFirst = paramsFirstCompList.includes(componentName)
          let params = ''
          if (isParamsFirst) {
            params = attributesToParams(attributes)
          }
          if (isNoRender(componentName)) {
            ret += `\n    const ${compVar} = ${parentVar}.addComponent(new ${componentName}(${params}))`
          } else {
            ret += `\n    const ${compVar} = ${componentName}.create(${params})`
          }
          attributes.forEach(({ name, value }) => {
            const attName = name.name
            if (attName === '$ref') {
              refs += `\n    ${classVar}.${value.value} = ${compVar}`
            } else if (attName.includes('$')) {
              const cbName = attName.replace('$', '')
              refs += `\n    ${compVar}.${cbName} = ${classVar}.${value.value}`
            } else if (!isParamsFirst || attName === 'node') {
              ret += parseAttribute(value, compVar, attName)
            }
          })
          if (parentVar && !isNoRender(componentName))
            ret += `\n     ${parentVar}.node.addChild(${compVar}.node)`
          children.forEach(element => {
            const { openingElement, children, type } = element
            if (type !== 'JSXElement') return;
            const { attributes, name } = openingElement
            parseJSX(name, children, attributes, compVar)
          })
        }
        parseJSX(rootTag, children, attributes)
        ret += `${refs}\n    return ${classVar}`
        console.log(currentClassName, ret.length)
        path.replaceWithSourceString(`function () {
          ${ret}
        }()`);
      }
    },
  }
}
