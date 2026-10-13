<script setup lang="ts" generic="T extends object">
import { computed } from "vue";
import {
  ElButton,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from "element-plus";
import {
  displayCellValue,
  formatTableValue,
  resolveTableOption,
} from "./cellValue";
import { RenderFunctionType } from "./types";
import type {
  DataTableColumn,
  TableButton,
  TableContext,
  TableOption,
} from "./types";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    rows: T[];
    columns: DataTableColumn<T>[];
    loading?: boolean;
    rowKey: string | ((row: T) => string | number);
    emptyText?: string;
    size?: "large" | "default" | "small";
    tableLayout?: "fixed" | "auto";
    emptyValue?: string;
  }>(),
  {
    loading: false,
    emptyText: "\u6682\u65e0\u6570\u636e",
    size: "default",
    tableLayout: "fixed",
    emptyValue: "\u2014",
  },
);

const emit = defineEmits<{
  "row-click": [row: T];
}>();

defineSlots<{
  [key: `cell-${string}`]: (context: TableContext<T>) => unknown;
}>();

function cellValue(row: T, column: DataTableColumn<T>): unknown {
  return column.prop ? row[column.prop] : undefined;
}

const elementRowKey = computed<string | ((row: T) => string)>(() => {
  const rowKey = props.rowKey;
  return typeof rowKey === "function" ? (row) => String(rowKey(row)) : rowKey;
});

function formattedValue(context: TableContext<T>): string | number | boolean {
  const { value, column } = context;
  if (column.formatter)
    return displayCellValue(column.formatter(context), props.emptyValue);

  if (
    column.type === RenderFunctionType.Select ||
    column.type === RenderFunctionType.Enum
  ) {
    return displayCellValue(
      resolveTableOption(column.options, value),
      props.emptyValue,
    );
  }

  if (
    column.type === RenderFunctionType.Link ||
    column.type === RenderFunctionType.Tooltip
  )
    return displayCellValue(value, props.emptyValue);

  return displayCellValue(
    column.type ? formatTableValue(column.type, value) : value,
    props.emptyValue,
  );
}

function optionFor(
  column: DataTableColumn<T>,
  value: unknown,
): string | TableOption | undefined {
  if (Array.isArray(column.options)) {
    return column.options.find(
      (item) => item.value === value || String(item.value) === String(value),
    );
  }
  if (column.options && typeof column.options === "object")
    return column.options[String(value)];
  return undefined;
}

function optionLabel(column: DataTableColumn<T>, value: unknown) {
  const option = optionFor(column, value);
  return typeof option === "string"
    ? option
    : (option?.label ?? props.emptyValue);
}

function optionColor(column: DataTableColumn<T>, value: unknown) {
  const option = optionFor(column, value);
  return typeof option === "string" ? undefined : option?.color;
}

function optionType(column: DataTableColumn<T>, value: unknown) {
  const option = optionFor(column, value);
  return typeof option === "string" ? undefined : option?.type;
}

function tagValues(value: unknown): unknown[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [...value];
  if (typeof value === "number" || typeof value === "boolean") return [value];
  return [];
}

function buttonDisabled(
  button: TableButton<T>,
  context: TableContext<T>,
): boolean {
  return typeof button.disabled === "function"
    ? button.disabled(context)
    : Boolean(button.disabled);
}

function buttonHidden(
  button: TableButton<T>,
  context: TableContext<T>,
): boolean {
  return typeof button.hidden === "function"
    ? button.hidden(context)
    : Boolean(button.hidden);
}

function tableRowClick(row: T) {
  emit("row-click", row);
}
</script>

<template>
  <ElTable
    :data="rows"
    :row-key="elementRowKey"
    :loading="loading"
    :empty-text="emptyText"
    :size="size"
    :table-layout="tableLayout"
    class="data-table"
    @row-click="tableRowClick"
  >
    <ElTableColumn
      v-for="column in columns"
      :key="column.key"
      :label="column.label"
      :prop="column.prop"
      :width="column.width"
      :min-width="column.minWidth"
      :align="column.align"
      :fixed="column.fixed"
      :show-overflow-tooltip="column.showOverflowTooltip"
    >
      <template #default="{ row, $index }">
        <slot
          :name="`cell-${column.key}`"
          :row="row"
          :value="cellValue(row, column)"
          :column="column"
          :row-index="$index"
        >
          <template
            v-if="column.type === RenderFunctionType.Tag && !column.formatter"
          >
            <span class="data-table__tags">
              <ElTag
                v-for="(value, index) in tagValues(cellValue(row, column))"
                :key="`${String(value)}-${index}`"
                effect="light"
                :color="optionColor(column, value)"
                :type="optionType(column, value)"
              >
                {{ optionLabel(column, value) }}
              </ElTag>
              <span v-if="!tagValues(cellValue(row, column)).length">—</span>
            </span>
          </template>
          <ElTag
            v-else-if="
              column.type === RenderFunctionType.Status && !column.formatter
            "
            effect="light"
            :color="optionColor(column, cellValue(row, column))"
            :type="optionType(column, cellValue(row, column))"
          >
            {{ optionLabel(column, cellValue(row, column)) }}
          </ElTag>
          <ElButton
            v-else-if="
              column.type === RenderFunctionType.Link && !column.formatter
            "
            link
            type="primary"
            class="data-table__link"
            @click.stop="
              column.linkAction?.({
                row,
                value: cellValue(row, column),
                column,
                rowIndex: $index,
              })
            "
          >
            {{
              formattedValue({
                row,
                value: cellValue(row, column),
                column,
                rowIndex: $index,
              })
            }}
          </ElButton>
          <ElTooltip
            v-else-if="
              column.type === RenderFunctionType.Tooltip && !column.formatter
            "
            v-bind="column.tooltipOptions"
            :content="
              String(
                formattedValue({
                  row,
                  value: cellValue(row, column),
                  column,
                  rowIndex: $index,
                }),
              )
            "
          >
            <span class="data-table__tooltip-cell">{{
              formattedValue({
                row,
                value: cellValue(row, column),
                column,
                rowIndex: $index,
              })
            }}</span>
          </ElTooltip>
          <div
            v-else-if="column.buttons && column.buttons.length"
            class="data-table__actions"
          >
            <template v-for="btn in column.buttons ?? []" :key="btn.key">
              <ElButton
                v-if="
                  !buttonHidden(btn, {
                    row,
                    value: cellValue(row, column),
                    column,
                    rowIndex: $index,
                  })
                "
                :type="btn.type ?? 'primary'"
                text
                size="small"
                :disabled="
                  buttonDisabled(btn, {
                    row,
                    value: cellValue(row, column),
                    column,
                    rowIndex: $index,
                  })
                "
                @click.stop="
                  btn.onClick?.({
                    row,
                    value: cellValue(row, column),
                    column,
                    rowIndex: $index,
                  })
                "
              >
                {{ btn.label }}
              </ElButton>
            </template>
          </div>
          <template v-else>{{
            formattedValue({
              row,
              value: cellValue(row, column),
              column,
              rowIndex: $index,
            })
          }}</template>
        </slot>
      </template>
    </ElTableColumn>
  </ElTable>
</template>

<style scoped>
.data-table {
  width: 100%;
}

.data-table :deep(.el-table__cell) {
  min-width: 0;
}

.data-table__tags {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.data-table__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.data-table__link {
  position: relative;
  padding: 0;
}

.data-table__link::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 1px;
  background: var(--color-primary);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.2s ease;
}

.data-table__link:hover::after {
  transform: scaleX(1);
}

.data-table__tooltip-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}
</style>
