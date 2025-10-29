import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import CreateOutfitReqDto from './dto/create-outfit.req.dto';
import { PrismaService } from 'src/database/prisma.service';
import { JwtPayloadType } from '../auth/types/jwt-payload.type';
import AddClosetItemToOutfitReqDto from './dto/add-closet-item-to-outfit.req.dto';
import { ClosetService } from '../closet/closet.service';
import { CloudflareService } from 'src/database/cloudflare.service';

@Injectable()
export class OutfitService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly closetService: ClosetService,
    private readonly cloudflareService: CloudflareService,
  ) {}

  async createNewOutfit(
    createOutfitReqDto: CreateOutfitReqDto,
    currentUser: JwtPayloadType,
  ) {
    return await this.prismaService.outfit.create({
      data: {
        ...createOutfitReqDto,
        user_id: currentUser.id,
      },
    });
  }

  async addClosetItemToOutfit(
    outfitId: string,
    currentUser: JwtPayloadType,
    addClosetItemToOutfitReqDto: AddClosetItemToOutfitReqDto,
  ) {
    const outfit = await this.prismaService.outfit.findFirst({
      where: {
        id: outfitId,
      },
    });

    if (!outfit) {
      throw new NotFoundException('Outfit not found');
    }

    if (outfit.user_id !== currentUser.id) {
      throw new UnauthorizedException(
        "You don't have permission to add item to this outfit",
      );
    }

    const { closet_item_ids } = addClosetItemToOutfitReqDto;
    for (const closet_item_id of closet_item_ids) {
      const closetItem = await this.closetService.getItemById(closet_item_id);
      if (!closetItem) {
        throw new NotFoundException('ClosetItem not found');
      }
      switch (closetItem.type) {
        case 'TOPS': {
          await this.prismaService.outfit.update({
            where: {
              id: outfitId,
            },
            data: {
              top_id: closetItem.id,
            },
          });
          break;
        }
        case 'OUTWEAR': {
          await this.prismaService.outfit.update({
            where: {
              id: outfitId,
            },
            data: {
              outwear_id: closetItem.id,
            },
          });
          break;
        }
        case 'BOTTOMS': {
          await this.prismaService.outfit.update({
            where: {
              id: outfitId,
            },
            data: {
              bottom_id: closetItem.id,
            },
          });
          break;
        }
        default: {
          await this.prismaService.outfit.update({
            where: {
              id: outfitId,
            },
            data: {
              accessories: {
                connect: closetItem,
              },
            },
          });
          break;
        }
      }
    }

    const updatedOutfit = await this.prismaService.outfit.findFirst({
      where: {
        id: outfitId,
      },
      select: {
        id: true,
        name: true,
        user_id: true,
        style: true,
        occasion: true,
        season: true,
        color_theme: true,
        created_at: true,
        updated_at: true,
        bottom: true,
        top: true,
        outwear: true,
        accessories: true,
      },
    });

    return updatedOutfit;
  }

  async getOutfit(outfitId: string) {
    const outfit = await this.prismaService.outfit.findUnique({
      where: {
        id: outfitId,
      },
      select: {
        id: true,
        name: true,
        user_id: true,
        style: true,
        occasion: true,
        season: true,
        color_theme: true,
        created_at: true,
        updated_at: true,
        top: true,
        bottom: true,
        outwear: true,
        accessories: true,
      },
    });

    if (!outfit) {
      throw new NotFoundException('Outfit not found');
    }

    return await this.processOutfit(outfit);
  }

  async getOutfitsByUserId(currentUser: JwtPayloadType, userId: string) {
    const outfits = await this.prismaService.outfit.findMany({
      where: {
        user_id: userId ? userId : currentUser.id,
      },
      select: {
        id: true,
        name: true,
        user_id: true,
        style: true,
        occasion: true,
        season: true,
        color_theme: true,
        created_at: true,
        updated_at: true,
        top: true,
        bottom: true,
        outwear: true,
        accessories: true,
      },
    });

    return Promise.all(outfits.map((outfit) => this.processOutfit(outfit)));
  }

  private async processOutfit(outfit: any) {
    if (!outfit) {
      return outfit;
    }

    const resolveClosetItem = async (item: any) => {
      if (!item) {
        return item;
      }

      const image = await this.cloudflareService.getDownloadedUrl(item.image);

      // Return a consistent response shape with the new fields
      return {
        id: item.id,
        user_id: item.user_id,
        name: item.name,
        type: item.type,
        image,
        color_palette: item.color_palette ?? null,
        material: item.material ?? null,
        style_tag: item.style_tag ?? null,
        created_at: item.created_at ? item.created_at.toISOString() : null,
        updated_at: item.updated_at ? item.updated_at.toISOString() : null,
      };
    };

    const [top, bottom, outwear] = await Promise.all([
      resolveClosetItem(outfit.top),
      resolveClosetItem(outfit.bottom),
      resolveClosetItem(outfit.outwear),
    ]);

    const accessories = Array.isArray(outfit.accessories)
      ? await Promise.all(
          outfit.accessories.map((accessory: any) =>
            resolveClosetItem(accessory),
          ),
        )
      : outfit.accessories;

    return {
      id: outfit.id,
      name: outfit.name,
      user_id: outfit.user_id,
      style: outfit.style ?? null,
      occasion: outfit.occasion ?? null,
      season: outfit.season ?? null,
      color_theme: outfit.color_theme ?? null,
      created_at: outfit.created_at ? outfit.created_at.toISOString() : null,
      updated_at: outfit.updated_at ? outfit.updated_at.toISOString() : null,
      top,
      bottom,
      outwear,
      accessories,
    };
  }
}
