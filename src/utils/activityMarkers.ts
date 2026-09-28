import type { CamundaActivityInstance } from '../api/camunda/types'

/** 活动实例和异步转换使用 BPMN activityId，不能使用运行时 activityInstanceId。 */
export function collectActiveActivityIds(root?: CamundaActivityInstance): string[] {
  const ids = new Set<string>()
  function visit(activity: CamundaActivityInstance, isRoot = false) {
    if (!isRoot && activity.activityId) ids.add(activity.activityId.replace(/#multiInstanceBody$/, ''))
    activity.childTransitionInstances?.forEach(item => { if (item.activityId) ids.add(item.activityId.replace(/#multiInstanceBody$/, '')) })
    activity.childActivityInstances?.forEach(child => visit(child))
  }
  if (root) visit(root, true)
  return [...ids]
}
