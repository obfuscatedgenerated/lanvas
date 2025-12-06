interface GridLinesProps {
    pixel_size: number;
    grid_height: number;
    grid_width: number;
    visible?: boolean;
}

const GridLines = ({ pixel_size, grid_height, grid_width, visible = true }: GridLinesProps) => (
    // use css gradient to draw grid lines
    <div
        style={{
            width: grid_width * pixel_size,
            height: grid_height * pixel_size,
            backgroundImage: `
                linear-gradient(to right, rgba(0, 0, 0, 0.25) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0, 0, 0, 0.25) 1px, transparent 1px)
            `,
            backgroundSize: `${pixel_size}px ${pixel_size}px`,
        }}

        className={`absolute top-0 left-0 pointer-events-none ${visible ? "opacity-100" : "opacity-0"} transition-opacity duration-400`}
    />
);

export default GridLines;
