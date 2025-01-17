/*global console, module*/

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
    case 'ThisExpression': {
      return 'this'
    }
    default:
      console.log('not support', type, value)
  }
}

function parseExpression(expression) {
  const { type, extra, object, property, value, name, computed } = expression
  switch (type) {
    case 'Identifier':
      return name
    case 'BooleanLiteral':
      return value
    case 'StringLiteral':
    case 'NumericLiteral':
      return extra.raw
    case 'MemberExpression': {
      const left = parseValue(object)
      const right = parseValue(property)
      if (computed) return `${left}[${right}]`
      return `${left}.${right}`
    }
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

module.exports = function ({ types: t }) {
  return {
    visitor: {
      Program: {
        exit(path, state) {
          if (state.isComponentX) {
            const logStatement = t.expressionStatement(
              t.callExpression(t.identifier('registerSystem'), [t.identifier(state.currentClassName)]),
            )
            path.pushContainer('body', logStatement)
          }
        },
      },
      ImportDeclaration(path) {
        // console.log(path.node)
        const { source } = path.node
        if (source.value === '@safe-engine/pixi' || source.value === 'safex' || source.value === '@safex/cocos') {
          const identifier = t.identifier('registerSystem')
          path.pushContainer('specifiers', identifier)
        }
      },
      ExportDeclaration(path, state) {
        // state.hasStart = false
        if (path.node.declaration && path.node.declaration.id) state.currentClassName = path.node.declaration.id.name
      },
      ClassDeclaration(path, state) {
        state.hasStart = false
        state.currentClassName = path.node.id.name
        // console.log('state.currentClassName', state.currentClassName)
        const { superClass } = path.node
        if (superClass && superClass.name && superClass.name.includes('ComponentX')) {
          state.isComponentX = true
        }
      },
      ClassMethod(path, state) {
        // console.log(path.node.key.name)
        if ('start' === path.node.key.name) {
          state.hasStart = true
        }
      },
      JSXElement(path, state) {
        const { openingElement, children } = path.node
        const { attributes, name: rootTag } = openingElement
        let ret = ''
        let begin = ''
        const classVar = getComponentName(state.currentClassName)
        function parseJSX(tagName, children, attributes = [], parentVar) {
          const componentName = tagName.name
          // console.log('parseJSX', componentName)
          if (componentName === 'ExtraDataComp') {
            // console.log(parentVar, attributes[1])
            const key = attributes.find(({ name }) => name.name === 'key').value.value
            const value = attributes.find(({ name }) => name.name === 'value')
            ret += `\n     ${parentVar}.node.setData('${key}', ${parseValue(value.value)})`
            return
          }
          const compVar = getComponentName(componentName)
          const params = attributesToParams(attributes)
          const createComponentString = `\n    const ${compVar} = ${componentName}.create(${params})`
          if (!parentVar) {
            begin += createComponentString
            begin += `\n   const ${classVar} = ${compVar}.addComponent(new ${state.currentClassName}())`
          } else {
            ret += createComponentString
          }
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
              if (isPushList) ret += `\n${leftVar}.push(${rightValue});`
              else ret += `\n${leftVar} = ${rightValue};`
            } else if (attName.includes('$')) {
              const cbName = attName.replace('$', '')
              let bindVal
              if (value.value.includes('.')) {
                const [refVal] = value.value.split('.')
                bindVal = `${classVar}.${refVal}`
              } else {
                bindVal = `${classVar}`
              }
              if (value.value === 'node') {
                ret += `\n${compVar}.${cbName}=${classVar}.node;`
              } else if (collideEvents.includes(cbName)) {
                ret += `\n${compVar}.set${capitalizeFirstLetter(cbName)}(${classVar}.${value.value}.bind(${bindVal}));`
              } else {
                ret += `\n${compVar}.${cbName}=${classVar}.${value.value}.bind(${bindVal});`
              }
            } else if (attName === 'node') {
              ret += parseAttribute(value, compVar, attName)
            }
          })
          children.forEach((element) => {
            const { openingElement, children, type, expression } = element
            if (type !== 'JSXElement') {
              if (type === 'JSXExpressionContainer') {
                parseJSXExpressionContainer(expression, compVar)
              }
              return
            }
            const { attributes, name } = openingElement
            parseJSX(name, children, attributes, compVar)
          })
        }
        function parseJSXExpressionContainer(expression, compVar) {
          const { type, callee, arguments: args } = expression
          if (type === 'CallExpression') {
            const callback = args[0]
            // console.log('CallExpression', callee, callback)
            const { object } = callee
            if (object.callee && object.callee.name === 'Array') {
              // console.log('callee', loopCount, callback.params[1])
              const { name, left, right } = callback.params[1]
              const indexVar = name || left.name
              const startIndex = right.value || 0
              const loopCount = object.arguments[0].value + startIndex
              ret += `\n for(let ${indexVar} = ${startIndex}; ${indexVar} < ${loopCount}; ${indexVar}++) {`
              const { type, openingElement, children } = callback.body
              if (type === 'CallExpression') {
                // console.log('callee', loopCount, callback.body)
                const { callee, arguments: args } = callback.body
                const callback2 = args[0]
                const { object } = callee
                if (object.callee && object.callee.name === 'Array') {
                  const { name, left, right } = callback2.params[1]
                  const indexVar = name || left.name
                  const startIndex = right.value || 0
                  const loopCount = object.arguments[0].value + startIndex
                  ret += `\n for(let ${indexVar} = ${startIndex}; ${indexVar} < ${loopCount}; ${indexVar}++) {`
                  const { openingElement, children } = callback2.body
                  const { attributes, name: rootTag } = openingElement
                  // console.log('parse MemberExpression', rootTag, children, attributes)
                  parseJSX(rootTag, children, attributes, compVar)
                  ret += '\n }'
                }
              } else {
                const { attributes, name: rootTag } = openingElement
                // console.log('parse MemberExpression', rootTag, children, attributes)
                parseJSX(rootTag, children, attributes, compVar)
              }
              ret += '\n }'
            } else {
              // console.log('loopVar', type, object, callback.params[1])
              const { name, left, right } = callback.params[1]
              const indexVar = name || left.name
              const loopVar = parseValue(object)
              const itemVar = callback.params[0].name
              const startIndex = right.value || 0
              if (startIndex) {
                ret += `\n for(let ${indexVar} = ${startIndex}; ${indexVar} < ${loopVar}.length + ${startIndex}; ${indexVar}++) {`
                ret += `\n const ${itemVar} = ${loopVar}[${indexVar} - ${startIndex}]`
              } else {
                ret += `\n for(let ${indexVar} = 0; ${indexVar} < ${loopVar}.length; ${indexVar}++) {`
                ret += `\n const ${itemVar} = ${loopVar}[${indexVar}]`
              }
              const { openingElement, children } = callback.body
              const { attributes, name: rootTag } = openingElement
              // console.log('parse MemberExpression', rootTag, children, attributes)
              parseJSX(rootTag, children, attributes, compVar)
              ret += '\n }'
            }
          }
        }
        parseJSX(rootTag, children, attributes)
        if (state.hasStart) {
          ret += `\n${classVar}.start();`
        }
        ret += `\n    return ${classVar}`
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
