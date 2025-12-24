import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Grid from '@mui/material/Grid';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  ReferenceLine,
  LabelList,
} from 'recharts';

type Props = {
  openTimes: number[];
  closeTimes: number[];
  openThreshold?: number; // LimiteAbertura
  closeThreshold?: number; // LimiteFechamento
};

function toChartData(values: number[]) {
  return values.map((v, i) => ({ label: `C${i + 1}`, value: v }));
}

export default function OpenCloseBars({ openTimes, closeTimes, openThreshold = 0, closeThreshold = 0 }: Props) {
  const dataOpen = toChartData(openTimes);
  const dataClose = toChartData(closeTimes);

  // Label dinâmico: se o valor excede o teto (12s), escreve o valor dentro no topo; caso contrário, acima da barra
  const ValueLabel = (props: any) => {
    const { x, y, width, value } = props as { x: number; y: number; width: number; value: number };
    if (value == null) return null;
    const isClamped = value >= 12;
    const cx = x + width / 2;
    const cy = y + (isClamped ? 12 : -4);
    return (
      <text x={cx} y={cy} textAnchor="middle" fontSize={12} fill={isClamped ? '#000' : '#333'}>
        {`${value}s`}
      </text>
    );
  };

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <Card variant="outlined" className="chart-card chart-times">
          <CardHeader title="Tempos de Abertura" titleTypographyProps={{ align: 'center', sx: { fontSize: '16px' } }} />
          <CardContent>
            <div className="chart-inner" style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={dataOpen} margin={{ top: 8, right: 16, left: 16, bottom: 28 }} barSize={38} barCategoryGap="12%">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} label={{ value: 'Ciclos', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }} />
                  <YAxis domain={[0, 12]} allowDecimals={false} tick={{ fontSize: 12 }} label={{ value: 'Tempo (s)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                  <Tooltip formatter={(v: number) => [`${v}s`, 'Tempo']} />
                  {openThreshold > 0 && (
                    <ReferenceLine
                      y={openThreshold}
                      stroke="#E0493A"
                      strokeDasharray="6 6"
                      label={{ value: `Limite (${openThreshold}s)`, position: 'right', fill: '#E0493A', style: { fontSize: 12 } }}
                    />
                  )}
                  <Bar dataKey="value" name="Tempo (s)" fill="#88C6DA" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="value" content={<ValueLabel />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card variant="outlined" className="chart-card chart-times">
          <CardHeader title="Tempos de Fechamento" titleTypographyProps={{ align: 'center', sx: { fontSize: '16px' } }} />
          <CardContent>
            <div className="chart-inner" style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={dataClose} margin={{ top: 8, right: 16, left: 16, bottom: 28 }} barSize={38} barCategoryGap="12%">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} label={{ value: 'Ciclos', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }} />
                  <YAxis domain={[0, 12]} allowDecimals={false} tick={{ fontSize: 12 }} label={{ value: 'Tempo (s)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
                  <Tooltip formatter={(v: number) => [`${v}s`, 'Tempo']} />
                  {closeThreshold > 0 && (
                    <ReferenceLine
                      y={closeThreshold}
                      stroke="#E0493A"
                      strokeDasharray="6 6"
                      label={{ value: `Limite (${closeThreshold}s)`, position: 'right', fill: '#E0493A', style: { fontSize: 12 } }}
                    />
                  )}
                  <Bar dataKey="value" name="Tempo (s)" fill="#E0832F" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="value" content={<ValueLabel />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
