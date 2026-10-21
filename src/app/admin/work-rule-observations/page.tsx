import type { Metadata } from 'next';
import ObservationsClient from './ObservationsClient';
export const metadata:Metadata={title:'취업규칙 오탐 검토',robots:{index:false,follow:false}};
export default function Page(){return <ObservationsClient/>;}
