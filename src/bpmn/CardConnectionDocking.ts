import CroppingConnectionDocking from 'diagram-js/lib/layout/CroppingConnectionDocking'
import type { Connection, Shape } from 'bpmn-js/lib/model/Types'
import { normalizeCardConnections } from './layout'

/** Reuse BPMN cropping and command history; only repair unsafe card ports. */
export default class CardConnectionDocking extends CroppingConnectionDocking {
  getCroppedWaypoints(connection: Connection, source?: Shape, target?: Shape): Connection['waypoints'] {
    const points: Connection['waypoints'] = super.getCroppedWaypoints(connection, source, target)
    if (connection.type !== 'bpmn:SequenceFlow') return points
    return normalizeCardConnections(points, source ?? connection.source, target ?? connection.target)
  }
}
