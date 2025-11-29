interface FancyButtonProps extends React.ComponentProps<"button"> {
    children?: React.ReactNode,
    className?: string;
}

export const fancy_button_class = "text-sm sm:text-lg cursor-pointer ml-2 px-3 py-1 bg-slate-800 text-white rounded hover:bg-slate-900 transition duration-300";

const FancyButton = ({children = null, className = "", ...rest}: FancyButtonProps) => (
    <button className={`${fancy_button_class} ${className}`} {...rest}>
        {children}
    </button>
)

export default FancyButton;
