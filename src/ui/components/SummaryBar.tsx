import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Legend, Cell } from 'recharts';

type Props = { total: number; normais: number; falhas: number; title?: string };

export default function SummaryBar({ total, normais, falhas, title = 'Análise de atuações no período' }: Props) {
  const data = [
    { name: 'Comandos', value: total, color: '#729CDA', legend: 'Total de comandos' },
    { name: 'Normais', value: normais, color: '#46DFC5', legend: 'Atuações normais' },
    { name: 'Falhas', value: falhas, color: '#E0493A', legend: 'Falhas' },
  ];

  return (
    <Card variant="outlined" className="chart-card chart-summary">
      <CardHeader title={title} titleTypographyProps={{ align: 'center', sx: { fontSize: '16px' } }} />
      <CardContent>
        <div className="chart-inner" style={{ width: '100%', height: 380 }}>
          <ResponsiveContainer>
            <BarChart
              data={data}
              margin={{ top: 16, right: 120, left: 16, bottom: 24 }}
              barSize={84}
              barCategoryGap={"8%"}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} label={{ value: 'Eventos observados', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} label={{ value: 'Quantidade', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
              <Tooltip formatter={(v: number) => [v, 'Quantidade']} />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="top"
                wrapperStyle={{ right: 8, top: 8, fontSize: 10 }}
                payload={data.map((d) => ({ value: d.legend, color: d.color, type: 'square', id: d.name }))}
              />
              <Bar dataKey="value" name="Quantidade" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
