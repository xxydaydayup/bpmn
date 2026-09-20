import user from '../assets/tabler/user-check.svg?raw'
import service from '../assets/tabler/robot.svg?raw'
import start from '../assets/tabler/player-play.svg?raw'
import end from '../assets/tabler/square.svg?raw'
import branch from '../assets/tabler/arrows-split.svg?raw'
import plus from '../assets/tabler/plus.svg?raw'
import close from '../assets/tabler/x.svg?raw'
import search from '../assets/tabler/search.svg?raw'
import undo from '../assets/tabler/arrow-back-up.svg?raw'
import redo from '../assets/tabler/arrow-forward-up.svg?raw'
import upload from '../assets/tabler/upload.svg?raw'
import download from '../assets/tabler/download.svg?raw'
import code from '../assets/tabler/code.svg?raw'
import fit from '../assets/tabler/focus-2.svg?raw'
import zoomIn from '../assets/tabler/zoom-in.svg?raw'
import zoomOut from '../assets/tabler/zoom-out.svg?raw'
import hand from '../assets/tabler/hand-stop.svg?raw'
import pointer from '../assets/tabler/pointer.svg?raw'
import trash from '../assets/tabler/trash.svg?raw'
import link from '../assets/tabler/link.svg?raw'
import copy from '../assets/tabler/copy.svg?raw'
import check from '../assets/tabler/checklist.svg?raw'
import grip from '../assets/tabler/grip-vertical.svg?raw'
import settings from '../assets/tabler/adjustments-horizontal.svg?raw'
import info from '../assets/tabler/info-circle.svg?raw'
import replace from '../assets/tabler/switch-horizontal.svg?raw'
import library from '../assets/tabler/layout-sidebar-left-collapse.svg?raw'
import properties from '../assets/tabler/layout-sidebar-right-collapse.svg?raw'
import template from '../assets/tabler/template.svg?raw'
import layout from '../assets/tabler/sitemap.svg?raw'

/** Trusted, locally vendored Tabler SVG only. Never render XML/user input as HTML. */
export const diagramIcons = { user, service, start, end, branch, plus, close, search, undo, redo, upload, download, code, fit, zoomIn, zoomOut, hand, pointer, trash, link, copy, check, grip, settings, info, replace, library, properties, template, layout }
export type DiagramIconName = keyof typeof diagramIcons

export const nodePresentation: Record<string, { label: string; icon: DiagramIconName; tone: string }> = {
  'bpmn:UserTask': { label: '人工任务', icon: 'user', tone: 'human' },
  'bpmn:ServiceTask': { label: '服务任务', icon: 'service', tone: 'service' },
  'bpmn:StartEvent': { label: '开始事件', icon: 'start', tone: 'start' },
  'bpmn:EndEvent': { label: '结束事件', icon: 'end', tone: 'end' },
  'bpmn:ExclusiveGateway': { label: '条件分支', icon: 'branch', tone: 'branch' },
  'bpmn:ParallelGateway': { label: '并行分支', icon: 'plus', tone: 'parallel' },
  'bpmn:SequenceFlow': { label: '顺序流', icon: 'link', tone: 'neutral' },
  'bpmn:Process': { label: '流程', icon: 'layout', tone: 'human' },
}

export function presentNode(type?: string) {
  return nodePresentation[type ?? ''] ?? { label: '流程节点', icon: 'settings' as const, tone: 'neutral' }
}

export const libraryGroups = [
  { name: '事件', types: ['bpmn:StartEvent', 'bpmn:EndEvent'] },
  { name: '任务', types: ['bpmn:UserTask', 'bpmn:ServiceTask'] },
  { name: '分支', types: ['bpmn:ExclusiveGateway', 'bpmn:ParallelGateway'] },
]
