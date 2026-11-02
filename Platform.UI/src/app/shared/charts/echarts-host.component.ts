/**
 * EChartsHostComponent — thin canvas host for Apache ECharts.
 *
 * ── Deferred status ────────────────────────────────────────────────────────
 * This component is intentionally NOT used on the health or exchanges pages.
 * Trend charts are gated behind the `features.trendCharts` feature flag and
 * deferred until the backend exposes time-series endpoints.
 *
 * When the feature is enabled:
 *  1. Import this component into the relevant page.
 *  2. Bind a real ECharts `EChartsOption` object — DO NOT pass synthetic data.
 *  3. Lazily import echarts (see note on bundle size below).
 *
 * Bundle note:
 *   `echarts` is ~1 MB uncompressed. Use echarts custom build or
 *   dynamic import to avoid inflating the initial bundle:
 *   ```ts
 *   const { init } = await import('echarts/core');
 *   ```
 * ───────────────────────────────────────────────────────────────────────────
 */

import {
  AfterViewInit,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  effect,
  inject,
  input,
} from '@angular/core';

// Type-only import to avoid bundling the entire echarts package eagerly.
import type { ECharts, EChartsOption } from 'echarts';

@Component({
  selector: 'app-echarts-host',
  standalone: true,
  template: `
    <div
      #chartContainer
      class="echarts-host"
      [style.width]="width()"
      [style.height]="height()"
      role="img"
      [attr.aria-label]="ariaLabel()"
    ></div>
  `,
  styles: [`
    .echarts-host {
      display: block;
      width: 100%;
      min-height: 300px;
    }
  `],
})
export class EChartsHostComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartContainer', { static: true })
  private readonly containerRef!: ElementRef<HTMLDivElement>;

  /** ECharts option object — must come from real backend data. */
  readonly option = input<EChartsOption | null>(null);

  /** CSS width, e.g. "100%" or "600px". */
  readonly width = input<string>('100%');

  /** CSS height, e.g. "300px". */
  readonly height = input<string>('300px');

  /** Accessible label for screen readers. */
  readonly ariaLabel = input<string>('Chart');

  private chart: ECharts | null = null;

  async ngAfterViewInit(): Promise<void> {
    // Dynamically import echarts to keep it out of the initial chunk.
    const echarts = await import('echarts');
    this.chart = echarts.init(this.containerRef.nativeElement);

    const currentOption = this.option();
    if (currentOption) {
      this.chart.setOption(currentOption);
    }

    // Respond to container resize
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.containerRef.nativeElement);
  }

  private resizeObserver: ResizeObserver | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['option'] && this.chart) {
      const newOption = changes['option'].currentValue as EChartsOption | null;
      if (newOption) {
        this.chart.setOption(newOption, true);
      } else {
        this.chart.clear();
      }
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = null;
  }
}
