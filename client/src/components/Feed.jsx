import React from 'react';
import Posts from './Posts';

const Feed = () => {
  return (
    <div
      className="flex-1 my-8 px-2 flex flex-col items-center lg:pl-[20%]"
    >
      <Posts />
    </div>
  );
};

export default Feed;
