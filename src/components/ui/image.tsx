import NextImage, { type ImageProps } from "next/image";

type AppImageProps = ImageProps & {
  alt: string;
};

export function Image({ alt, ...props }: AppImageProps) {
  return <NextImage alt={alt} {...props} />;
}
