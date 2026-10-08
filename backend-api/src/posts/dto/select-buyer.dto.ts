import { IsNotEmpty, IsString } from 'class-validator';

/**
 * `POST /posts/:id/reservation` ("Select Buyer" + "Reserve Listing" —
 * Project Constitution §8 Rule 4: "Seller can select only one chat").
 * Selection operates on an existing chat, not a bare buyer `userId` — the
 * selected chat's `participantId` becomes the reserved buyer, derived, not
 * duplicated as a separate field anywhere.
 */
export class SelectBuyerDto {
  @IsString()
  @IsNotEmpty()
  chatId: string;
}
