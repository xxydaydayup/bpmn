/**
 * Camunda's descriptor omits the wildcard child slot that lets moddle-xml
 * round-trip vendor elements nested inside a FormField. Add it to a copy so
 * supported Camunda fields can be edited without dropping those children.
 */
export function withCamundaFormFieldWildcard<T>(source: T): T {
  const descriptor = structuredClone(source) as {
    types?: Array<{ name: string; properties?: Array<{ name?: string; [key: string]: unknown }> }>
  }
  const formField = descriptor.types?.find(type => type.name === 'FormField')

  if (formField && !formField.properties?.some(property => property.name === 'otherElements')) {
    formField.properties ??= []
    formField.properties.push({ name: 'otherElements', type: 'Element', isMany: true })
  }

  return descriptor as T
}
