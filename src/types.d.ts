export type RomanticIntent = 'none' | 'curious' | 'interested' | 'pursuing' | 'committed' | 'withdrawing';
export type PublicStatus = 'strangers' | 'acquaintances' | 'friends' | 'flirting' | 'dating' | 'partners' | 'estranged' | 'exes';
export type PrivateFeeling = 'indifferent' | 'fond' | 'attracted' | 'infatuated' | 'conflicted' | 'attached' | 'disillusioned' | 'hostile';
export interface RelationshipEvent {
    event_id: string;
    turn_index: number;
    scene_id: string;
    participants: string[];
    witnesses: string[];
    event_type: string;
    initiator: string;
    target: string;
    intensity: number;
    publicity: 'private' | 'witnessed' | 'public';
    interpretation: Record<string, string>;
    tags: string[];
    evidence_summary: string;
}
export interface RelationshipEdge {
    sourceId: string;
    targetId: string;
    familiarity: number;
    affinity: number;
    attraction: number;
    trust: number;
    respect: number;
    intimacy: number;
    commitment: number;
    dependency: number;
    jealousy: number;
    resentment: number;
    fear: number;
    compatibility: number;
    perceived_interest: number;
    romantic_intent: RomanticIntent;
    public_status: PublicStatus;
    private_feeling: PrivateFeeling;
    exclusivity_expectation: 'none' | 'preferred' | 'expected' | 'explicit';
    secrecy: number;
    momentum: number;
    last_meaningful_event: string;
    unresolved_issues: string[];
    evidence: string[];
}
