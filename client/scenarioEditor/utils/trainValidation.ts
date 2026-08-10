import type { ScenarioTrainDto } from "../../network/dto";

export function validateTrains(trains: ScenarioTrainDto[], networkStations: string[]): string[] {
   const errors: string[] = [];
   const inNetwork = new Set(networkStations.map((s) => s.toLowerCase()));
   const byNumber = new Map<string, ScenarioTrainDto>();
   const seen = new Map<string, string>();

   for (const train of trains) {
      const key = train.number.toLowerCase();
      if (seen.has(key)) {
         errors.push(`Duplicate train number: "${train.number}"`);
      } else {
         seen.set(key, train.number);
         byNumber.set(key, train);
      }
   }

   const referencedAsFollower = new Set<string>();
   for (const train of trains) {
      const following = train.followingTrainNumber?.trim();
      if (!following) continue;
      const key = following.toLowerCase();
      if (!byNumber.has(key)) {
         errors.push(`Train "${train.number}" followingTrainNumber "${following}" does not exist`);
      } else {
         referencedAsFollower.add(key);
      }
   }

   for (const train of trains) {
      const firstStation = train.timetable?.[0]?.station;
      if (!firstStation || !inNetwork.has(firstStation.toLowerCase())) continue;
      if (!referencedAsFollower.has(train.number.toLowerCase())) {
         errors.push(
            `Train "${train.number}" starts at in-network station "${firstStation}" but no train has it as followingTrainNumber`
         );
      }
   }

   return errors;
}
