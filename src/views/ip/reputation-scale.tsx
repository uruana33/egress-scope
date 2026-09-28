import { useEffect, useRef } from 'react';

import {
  BarChart,
  type BarSeriesOption,
  ScatterChart,
  type ScatterSeriesOption,
} from 'echarts/charts';
import {
  GraphicComponent,
  type GraphicComponentOption,
  GridComponent,
  type GridComponentOption,
} from 'echarts/components';
import { type ComposeOption, graphic, init, use as registerECharts } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n';

import type { ipProfile } from './profile';

registerECharts([BarChart, ScatterChart, GridComponent, GraphicComponent, SVGRenderer]);

const bands = [
  { size: 45, range: '0–44', label: t('偏低') },
  { size: 30, range: '45–74', label: t('一般') },
  { size: 15, range: '75–89', label: t('良好') },
  { size: 10, range: '90–100', label: t('高信誉') },
];

const SPECTRUM = ['#cd3832', '#ed8557', '#edc647', '#64c582', '#249139'];
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const TICKS = [0, 25, 50, 75, 100];

type ChartOption = ComposeOption<
  BarSeriesOption | ScatterSeriesOption | GridComponentOption | GraphicComponentOption
>;

function tickLabel(value: number) {
  if (value === 0) return t('0 低信誉');
  if (value === 100) return t('100 高信誉');
  return String(value);
}

const tickAlign = (value: number) => (value === 0 ? 'left' : value === 100 ? 'right' : 'center');

function bandSeries(index: number): BarSeriesOption {
  return {
    type: 'bar',
    stack: 'reputation',
    data: [25],
    barWidth: 10,
    silent: true,
    itemStyle: {
      color: new graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: SPECTRUM[index] },
        { offset: 1, color: SPECTRUM[index + 1] },
      ]),
      borderRadius: index === 0 ? [4, 0, 0, 4] : index === 3 ? [0, 4, 4, 0] : 0,
    },
  };
}

export function IpReputationScale({ profile }: { profile: ReturnType<typeof ipProfile> }) {
  const { scheme } = useTheme();
  const graph = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = graph.current;
    if (!element) return;
    const dark = scheme === 'dark' || profile.score === 100;
    const accent = dark ? '#f3ecdf' : '#20252c';
    const muted = dark ? '#b6ad9c' : '#64748b';
    const chart = init(element, null, { renderer: 'svg' });

    const draw = () => {
      chart.resize();
      const width = element.clientWidth;
      if (!width) return;
      const score = profile.score;
      const option: ChartOption = {
        animation: !window.matchMedia(REDUCED_MOTION).matches,
        animationDuration: 650,
        animationDurationUpdate: 260,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicOut',
        grid: { left: 4, right: 4, top: 7, bottom: 22 },
        xAxis: { type: 'value', min: 0, max: 100, show: false },
        yAxis: { type: 'category', data: ['score'], show: false },
        graphic: TICKS.map((value) => ({
          type: 'text',
          x: 4 + ((width - 8) * value) / 100,
          y: element.clientHeight - 10,
          style: {
            text: tickLabel(value),
            fill: muted,
            fontSize: 10,
            align: tickAlign(value),
            verticalAlign: 'middle',
          },
        })),
        series: [
          ...bands.map((_band, index) => bandSeries(index)),
          {
            type: 'scatter',
            data: score === null ? [] : [[score, 'score']],
            symbol: 'rect',
            symbolSize: [4, 20],
            z: 5,
            silent: true,
            itemStyle: {
              color: accent,
              opacity: 1,
              borderColor: dark ? '#191d24' : '#fff',
              borderWidth: 1,
            },
            label: {
              show: false,
              position: 'top',
              distance: 4,
              formatter: () => `${score}`,
              color: accent,
              fontSize: 13,
              fontWeight: 700,
              align: (score ?? 0) >= 90 ? 'right' : (score ?? 0) <= 10 ? 'left' : 'center',
            },
          },
        ],
      };
      chart.setOption(option);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [profile, scheme]);

  return (
    <div
      ref={graph}
      className="ip-reputation-scale"
      role="img"
      aria-label={
        profile.score === null
          ? t('信誉分未知')
          : t('信誉分 {0}/100，位于{1}区间', [profile.score, bands[profile.scoreBand!].label])
      }
    />
  );
}
