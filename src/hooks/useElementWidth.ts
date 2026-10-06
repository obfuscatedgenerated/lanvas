import {useEffect, useRef, useState} from "react";

export const useElementWidth = <ElementType extends HTMLElement>() => {
    const element_ref = useRef<ElementType>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const element = element_ref.current;
        if (!element) {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setWidth(entry.borderBoxSize[0]?.inlineSize ?? entry.target.getBoundingClientRect().width);
            }
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return [element_ref, width] as const;
};
