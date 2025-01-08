/* eslint-disable no-undef */
const collideEvents = ['onCollisionEnter', 'onCollisionExit', 'onCollisionStay']

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}
function camelCase(str) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
      return index === 0 ? word.toLowerCase() : word.toUpperCase()
    })
    .replace(/\s+/g, '')
}
const nameCount = {}
function getComponentName(name = '') {
  if (!nameCount[name]) nameCount[name] = 0
  return `${camelCase(name)}Comp${++nameCount[name]}`
}

function parseValue(value) {
  if (!value) return true
  const { type, expression } = value
  switch (type) {
    case 'JSXExpressionContainer': {
      return parseExpression(expression)
    }
    case 'BinaryExpression':
    case 'MemberExpression':
    case 'CallExpression': {
      return parseExpression(value)
    }
    case 'StringLiteral': {
      return value.extra.raw
    }
    case 'NumericLiteral': {
      return value.value
    }
    case 'Identifier': {
      return value.name
    }
    default:
      console.log('not support', type, value)
  }
}

function parseExpression(expression) {
  const { type, extra, object, property, value, name } = expression
  switch (type) {
    case 'Identifier':
      return name
    case 'BooleanLiteral':
      return value
    case 'StringLiteral':
    case 'NumericLiteral':
      return extra.raw
    case 'MemberExpression':
      return `${object.name}.${property.name}`
    case 'CallExpression': {
      const { callee, arguments: args } = expression

      return `${parseValue(callee)}(${args.map(parseValue).join(', ')})`
    }
    case 'UnaryExpression': {
      const { operator, argument: args } = expression
      return `${operator}${parseValue(args)}`
    }
    case 'BinaryExpression': {
      const { operator, right, left } = expression
      // console.log('Expression', expression)
      if ('BinaryExpression' === right.type && (right.operator === '+' || right.operator === '-')) {
        return `${parseValue(left)} ${operator} (${parseValue(right)})`
      }
      return `${parseValue(left)} ${operator} ${parseValue(right)}`
    }
    default:
      console.log('not support parseExpression', type)
  }
}

function parseAttribute(value, componentVar, prop) {
  if (value.type === 'JSXExpressionContainer' && value.expression.type === 'ObjectExpression') {
    const { properties } = value.expression
    return properties
      .map((p) => {
        return `\n    ${componentVar}.${prop}.${p.key.name} = ${parseExpression(p.value)}`
      })
      .join('')
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

let currentClassName
let hasStart = false
// let hadJSX = false
let register = ''
module.exports = function ({ types: t }) {
  return {
    pre() {
      register = ''
    },
    visitor: {
      ImportDeclaration(path) {
        // console.log(path.node)
        const { specifiers, source } = path.node
        if (source.value === '@safe-engine/pixi' || source.value === 'safex' || source.value === '@safex/cocos') {
          const identifier = t.identifier('registerSystem')
          path.pushContainer('specifiers', identifier)
        }
        if (source.value.includes('component')) {
          specifiers.forEach((sp) => {
            const componentName = sp.local.name
            const newReg = `registerSystem(${componentName});`
            if (!register.includes(newReg)) {
              register += newReg
            }
          })
        }
      },
      ExportDeclaration(path) {
        hasStart = false
        if (path.node.declaration && path.node.declaration.id) currentClassName = path.node.declaration.id.name
      },
      ClassDeclaration(path) {
        // console.log(path.node.body.body)
        hasStart = false
        if (!currentClassName) currentClassName = path.node.id.name
      },
      ClassMethod(path) {
        // console.log(path.node.key.name)
        if ('start' === path.node.key.name) {
          hasStart = true
        }
      },
      JSXElement(path) {
        // hadJSX = true
        const { openingElement, children } = path.node
        const { attributes, name: rootTag } = openingElement
        let ret = ''
        let refs = ''
        let begin = `${register}registerSystem(${currentClassName});`
        const classVar = getComponentName(currentClassName)
        function parseJSX(tagName, children, attributes = [], parentVar) {
          const componentName = tagName.name
          console.log('parseJSX', componentName)
          if (componentName === 'ExtraDataComp') {
            // console.log(parentVar, attributes[1])
            const key = attributes.find(({ name }) => name.name === 'key').value.value
            const value = attributes.find(({ name }) => name.name === 'value').value.expression.value
            ret += `\n     ${parentVar}.node.setData('${key}', ${value})`
            return
          }
          const compVar = getComponentName(componentName)
          if (!parentVar) {
            refs += `\n   const ${classVar} = ${compVar}.addComponent(new ${currentClassName}())`
          }
          const params = attributesToParams(attributes)
          ret += `\n    const ${compVar} = ${componentName}.create(${params})`
          if (parentVar) {
            ret += `\n     ${parentVar}.node.resolveComponent(${compVar})`
          }
          attributes.forEach(({ name, value }) => {
            const attName = name.name
            if (attName === '$ref') {
              let refString = value.value
              const isPushList = refString.endsWith('[]')
              // console.log(refString);
              if (isPushList) {
                refString = refString.replace('[]', '')
              }
              let leftVar = `${classVar}.${refString}`
              let rightValue = `${compVar}`
              if (refString.includes(':')) {
                const [refVal, compName] = refString.split(':')
                rightValue = `${compVar}.getComponent(${compName})`
                leftVar = `${classVar}.${refVal}`
              }
              if (isPushList) refs += `\n${leftVar}.push(${rightValue});`
              else refs += `\n${leftVar} = ${rightValue};`
              // } else if (attName === '$node') {
              //   refs += `\n${classVar}.${value.value} = ${compVar}.${cbName};`
            } else if (attName.includes('$')) {
              const cbName = attName.replace('$', '')
              let bindVal
              if (value.value.includes('.')) {
                const [refVal] = value.value.split('.')
                bindVal = `${classVar}.${refVal}`
              } else {
                bindVal = `${classVar}`
              }
              if (collideEvents.includes(cbName)) {
                refs += `\n${compVar}.set${capitalizeFirstLetter(cbName)}(${classVar}.${value.value}.bind(${bindVal}));`
              } else {
                refs += `\n${compVar}.${cbName}=${classVar}.${value.value}.bind(${bindVal});`
              }
            } else if (attName === 'node') {
              ret += parseAttribute(value, compVar, attName)
            }
          })
          children.forEach((element) => {
            const { openingElement, children, type, expression } = element
            if (type !== 'JSXElement') {
              if (type === 'JSXExpressionContainer') {
                // parseJSXExpressionContainer(element)
                const { type, callee, arguments: args } = expression
                if (type === 'CallExpression') {
                  const callback = args[0]
                  // console.log(callee, args)
                  const { type, object } = callee
                  if (type === 'MemberExpression' && object.callee.name === 'Array') {
                    const loopCount = object.arguments[0].value
                    // console.log('callee', loopCount, callback)
                    const indexVar = callback.params[1].name
                    ret += `\n for(let ${indexVar} = 0; ${indexVar} < ${loopCount}; ${indexVar}++) {`
                    const { openingElement, children } = callback.body
                    const { attributes, name: rootTag } = openingElement
                    // console.log('parse MemberExpression', rootTag, children, attributes)
                    parseJSX(rootTag, children, attributes, compVar)
                    ret += '\n }'
                  }
                }
              }
              return
            }
            const { attributes, name } = openingElement
            parseJSX(name, children, attributes, compVar)
          })
        }
        parseJSX(rootTag, children, attributes)
        if (hasStart) {
          refs += `\n${classVar}.start();`
        }
        ret += `${refs}\n    return ${classVar}`
        // console.log(currentClassName, ret.length)
        path.replaceWithSourceString(`function () {
          ${begin}
          ${ret}
        }()`)
        // console.log(path.node)
        path.parentPath.parentPath.replaceWith(path.node.callee.body)
      },
    },
  }
}
