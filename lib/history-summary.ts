export const emptySummary=()=>({reservations:0,cancelled:0,booked:0,collected:0,outstanding:0,outlook:Array<number>(7).fill(0)});
export type HistorySummary=ReturnType<typeof emptySummary>;
export function mergeSummary(a:HistorySummary,b:HistorySummary):HistorySummary{
 return {reservations:a.reservations+b.reservations,cancelled:a.cancelled+b.cancelled,booked:a.booked+b.booked,collected:a.collected+b.collected,outstanding:a.outstanding+b.outstanding,outlook:a.outlook.map((n,i)=>n+b.outlook[i])};
}
