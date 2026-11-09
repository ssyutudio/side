export interface Rate {
  value: number | null;
  n: number;
}
export interface DeckNumbers {
  users: number;
  wrapUps: number;
  tabsSetAside: number;
  linesSetAside: number;
  broughtBackWithUndo: number;
  sidySpoke: number;
  stepsShown: number;
  stepsClicked: number;
  clickRate: Rate;
  stillWorking10m: number;
  stillWorkingRate: Rate;
  hasData: boolean;
}
export function computeNumbers(data: unknown): DeckNumbers;
export function waitlistUrlFrom(usageSource: string): string | null;
export function writeNumbers(dir: string, numbers: DeckNumbers & Record<string, unknown>): void;
